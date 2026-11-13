/**
 * SP-M8x Core Web Audio Engine (Canonical)
 * 3-Tier Routing Topology with Master Gain -> Limiter chain,
 * asynchronous initialization returning AudioContext, and robust polyphonic voice management.
 */

export class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  
  private trackStrips: {
    input: GainNode;
    pan: StereoPannerNode | null;
    gain: GainNode;
  }[] = [];

  private auxDelay: {
    input: GainNode;
    delay: DelayNode;
    feedback: GainNode;
    output: GainNode;
  } | null = null;

  private padBuffers: Map<string | number, AudioBuffer> = new Map();
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private isInitialized = false;

  constructor() {}

  public getContext(): AudioContext | null {
    return this.audioCtx;
  }

  /**
   * Asynchronously initializes or resumes the AudioContext and returns it directly
   * to satisfy tracker engine clock expectations.
   */
  public async initialize(): Promise<AudioContext> {
    if (this.isInitialized && this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      return this.audioCtx;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: 44100 });

      // 1. Master Gain feeds into Master Limiter (expert DSP order to prevent post-limiter clipping)
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.audioCtx.currentTime);

      this.masterLimiter = this.audioCtx.createDynamicsCompressor();
      this.masterLimiter.threshold.setValueAtTime(-1.5, this.audioCtx.currentTime);
      this.masterLimiter.knee.setValueAtTime(0.0, this.audioCtx.currentTime);
      this.masterLimiter.ratio.setValueAtTime(20.0, this.audioCtx.currentTime);
      this.masterLimiter.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
      this.masterLimiter.release.setValueAtTime(0.100, this.audioCtx.currentTime);

      this.masterGain.connect(this.masterLimiter);
      this.masterLimiter.connect(this.audioCtx.destination);

      // 2. Aux Delay Bus (SDL)
      const delayInput = this.audioCtx.createGain();
      const delayNode = this.audioCtx.createDelay(2.0);
      delayNode.delayTime.setValueAtTime(0.375, this.audioCtx.currentTime);
      const delayFeedback = this.audioCtx.createGain();
      delayFeedback.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
      const delayOutput = this.audioCtx.createGain();
      delayOutput.gain.setValueAtTime(0.5, this.audioCtx.currentTime);

      delayInput.connect(delayNode);
      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayOutput);
      delayOutput.connect(this.masterGain);

      this.auxDelay = {
        input: delayInput,
        delay: delayNode,
        feedback: delayFeedback,
        output: delayOutput,
      };

      // 3. Eight Track Channel Strips
      this.trackStrips = [];
      for (let i = 0; i < 8; i++) {
        const input = this.audioCtx.createGain();
        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.8, this.audioCtx.currentTime);

        let pan: StereoPannerNode | null = null;
        if (this.audioCtx.createStereoPanner) {
          pan = this.audioCtx.createStereoPanner();
          pan.pan.setValueAtTime(0.0, this.audioCtx.currentTime);
          input.connect(gain);
          gain.connect(pan);
          pan.connect(this.masterGain);
        } else {
          input.connect(gain);
          gain.connect(this.masterGain);
        }

        this.trackStrips.push({ input, pan, gain });
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.isInitialized = true;
      return this.audioCtx;
    } catch (err) {
      console.error('[AudioEngine] Failed to initialize Web Audio Engine:', err);
      throw err;
    }
  }

  public async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.audioCtx) {
      await this.initialize();
    }
    if (!this.audioCtx) {
      throw new Error('AudioContext not initialized');
    }
    return await this.audioCtx.decodeAudioData(arrayBuffer);
  }

  public setPadBuffer(padId: string | number, buffer: AudioBuffer): void {
    this.padBuffers.set(padId, buffer);
  }

  public getPadBuffer(padId: string | number): AudioBuffer | undefined {
    return this.padBuffers.get(padId);
  }

  public setMasterVolume(volume: number): void {
    if (!this.audioCtx || !this.masterGain) return;
    const clamped = Math.max(0, Math.min(1.0, volume));
    this.masterGain.gain.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.015);
  }

  public setTrackVolume(trackIndex: number, volume: number): void {
    if (!this.audioCtx || !this.trackStrips[trackIndex]) return;
    const clamped = Math.max(0, Math.min(1.0, volume));
    this.trackStrips[trackIndex].gain.gain.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.015);
  }

  public setTrackPan(trackIndex: number, panValue: number): void {
    if (!this.audioCtx || !this.trackStrips[trackIndex]?.pan) return;
    const clamped = Math.max(-1.0, Math.min(1.0, panValue));
    this.trackStrips[trackIndex].pan!.pan.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.015);
  }

  public triggerPad(
    padId: string | number,
    options: {
      volume?: number;
      scheduledTime?: number;
      playbackRate?: number;
      trackIndex?: number;
    } = {},
  ): string | null {
    const buffer = this.padBuffers.get(padId);
    if (!buffer || !this.audioCtx) return null;

    const trackIndex = options.trackIndex ?? 0;
    const volume = options.volume ?? 1.0;
    const playbackRate = options.playbackRate ?? 1.0;
    const scheduledTime = options.scheduledTime ?? this.audioCtx.currentTime;

    this.triggerVoiceInternal(trackIndex, buffer, scheduledTime, playbackRate, volume);
    return String(padId);
  }

  public triggerVoice(trackIndexOrPadId: number | string, buffer?: AudioBuffer, playbackRate = 1.0, volume = 1.0): void {
    if (typeof trackIndexOrPadId === 'string' || typeof trackIndexOrPadId === 'number') {
      const resolvedBuffer = buffer || this.padBuffers.get(trackIndexOrPadId);
      if (resolvedBuffer && this.audioCtx) {
        this.triggerVoiceInternal(0, resolvedBuffer, this.audioCtx.currentTime, playbackRate, volume);
      }
    } else if (typeof trackIndexOrPadId === 'number' && buffer && this.audioCtx) {
      this.triggerVoiceInternal(trackIndexOrPadId, buffer, this.audioCtx.currentTime, playbackRate, volume);
    }
  }

  private triggerVoiceInternal(
    trackIndex: number,
    buffer: AudioBuffer,
    scheduledTime: number,
    playbackRate: number,
    volume: number,
  ): void {
    if (!this.audioCtx || !this.trackStrips[trackIndex]) return;

    try {
      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(playbackRate, scheduledTime);

      const voiceGain = this.audioCtx.createGain();
      voiceGain.gain.setValueAtTime(Math.max(0, Math.min(1.0, volume)), scheduledTime);

      source.connect(voiceGain);
      voiceGain.connect(this.trackStrips[trackIndex].input);

      source.start(scheduledTime);
      this.activeSources.add(source);

      source.onended = () => {
        source.disconnect();
        voiceGain.disconnect();
        this.activeSources.delete(source);
      };
    } catch (err) {
      console.error(`[AudioEngine] Error triggering voice on track ${trackIndex}:`, err);
    }
  }

  public stopVoice(_voiceId?: string | number): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (_) {}
      break;
    }
  }

  public stopAllVoices(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (_) {}
    }
    this.activeSources.clear();
  }

  public applyPunchInFx(fxType: string, active: boolean, _targetTrackIndex = -1): void {
    if (!this.audioCtx || !this.masterGain) return;

    const now = this.audioCtx.currentTime;
    if (fxType === 'KILL') {
      const targetGain = active ? 0.0 : 0.85;
      this.masterGain.gain.setTargetAtTime(targetGain, now, 0.005);
    } else if (fxType === 'SDL' && this.auxDelay) {
      const feedbackVal = active ? 0.85 : 0.4;
      this.auxDelay.feedback.gain.setTargetAtTime(feedbackVal, now, 0.010);
    }
  }

  public getContextTime(): number {
    return this.audioCtx ? this.audioCtx.currentTime : 0;
  }
}

export const audioEngine = new AudioEngine();
export default audioEngine;
