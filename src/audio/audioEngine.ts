/**
 * SP-M8x Core Web Audio Engine
 * Precision-typed implementation matching all external component and tracker method signatures.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
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

  public async initialize(): Promise<boolean> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return true;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass({ sampleRate: 44100 });

      // Master Limiter & Gain
      this.masterLimiter = this.ctx.createDynamicsCompressor();
      this.masterLimiter.threshold.setValueAtTime(-1.5, this.ctx.currentTime);
      this.masterLimiter.knee.setValueAtTime(0.0, this.ctx.currentTime);
      this.masterLimiter.ratio.setValueAtTime(20.0, this.ctx.currentTime);
      this.masterLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.masterLimiter.release.setValueAtTime(0.100, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      this.masterLimiter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Aux Delay Bus (SDL)
      const delayInput = this.ctx.createGain();
      const delayNode = this.ctx.createDelay(2.0);
      delayNode.delayTime.setValueAtTime(0.375, this.ctx.currentTime);
      const delayFeedback = this.ctx.createGain();
      delayFeedback.gain.setValueAtTime(0.4, this.ctx.currentTime);
      const delayOutput = this.ctx.createGain();
      delayOutput.gain.setValueAtTime(0.5, this.ctx.currentTime);

      delayInput.connect(delayNode);
      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayOutput);
      delayOutput.connect(this.masterLimiter);

      this.auxDelay = {
        input: delayInput,
        delay: delayNode,
        feedback: delayFeedback,
        output: delayOutput,
      };

      // 8 Track Channel Strips
      this.trackStrips = [];
      for (let i = 0; i < 8; i++) {
        const input = this.ctx.createGain();
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.8, this.ctx.currentTime);

        let pan: StereoPannerNode | null = null;
        if (this.ctx.createStereoPanner) {
          pan = this.ctx.createStereoPanner();
          pan.pan.setValueAtTime(0.0, this.ctx.currentTime);
          input.connect(gain);
          gain.connect(pan);
          pan.connect(this.masterLimiter);
        } else {
          input.connect(gain);
          gain.connect(this.masterLimiter);
        }

        this.trackStrips.push({ input, pan, gain });
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize Web Audio Engine:', err);
      return false;
    }
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.ctx) {
      await this.initialize();
    }
    if (!this.ctx) {
      throw new Error('AudioContext not initialized');
    }
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  public setPadBuffer(padId: string | number, buffer: AudioBuffer, _options?: any): string | null {
    this.padBuffers.set(padId, buffer);
    return String(padId);
  }

  public getPadBuffer(padId: string | number): AudioBuffer | undefined {
    return this.padBuffers.get(padId);
  }

  public setMasterVolume(volume: number) {
    if (!this.ctx || !this.masterGain) return;
    const clamped = Math.max(0, Math.min(1.0, volume));
    this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.015);
  }

  public setTrackVolume(trackIndex: number, volume: number) {
    if (!this.ctx || !this.trackStrips[trackIndex]) return;
    const clamped = Math.max(0, Math.min(1.0, volume));
    this.trackStrips[trackIndex].gain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.015);
  }

  public setTrackPan(trackIndex: number, panValue: number) {
    if (!this.ctx || !this.trackStrips[trackIndex]?.pan) return;
    const clamped = Math.max(-1.0, Math.min(1.0, panValue));
    this.trackStrips[trackIndex].pan!.pan.setTargetAtTime(clamped, this.ctx.currentTime, 0.015);
  }

  public triggerPad(padId: string | number, trackIndexOrOptions: number | any = 0, volume: number = 1.0, playbackRate: number = 1.0) {
    const buffer = this.padBuffers.get(padId);
    if (buffer) {
      const trackIdx = typeof trackIndexOrOptions === 'number' ? trackIndexOrOptions : (trackIndexOrOptions?.trackIndex ?? 0);
      const vol = typeof trackIndexOrOptions === 'number' ? volume : (trackIndexOrOptions?.volume ?? volume);
      const rate = typeof trackIndexOrOptions === 'number' ? playbackRate : (trackIndexOrOptions?.playbackRate ?? playbackRate);
      this.triggerVoice(trackIdx, buffer, rate, vol);
    }
  }

  public triggerVoice(trackIndex: number, buffer: AudioBuffer, playbackRate: number = 1.0, volume: number = 1.0) {
    if (!this.ctx || !this.isInitialized || !this.trackStrips[trackIndex]) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(playbackRate, this.ctx.currentTime);

      const voiceGain = this.ctx.createGain();
      voiceGain.gain.setValueAtTime(Math.max(0, Math.min(1.0, volume)), this.ctx.currentTime);

      source.connect(voiceGain);
      voiceGain.connect(this.trackStrips[trackIndex].input);

      source.start(this.ctx.currentTime);
      this.activeSources.add(source);

      source.onended = () => {
        source.disconnect();
        voiceGain.disconnect();
        this.activeSources.delete(source);
      };
    } catch (err) {
      console.error(`Error triggering voice on track ${trackIndex}:`, err);
    }
  }

  public stopVoice(_voiceId?: any) {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch (_) {}
      break;
    }
  }

  public stopAllVoices() {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (_) {}
    }
    this.activeSources.clear();
  }

  public applyPunchInFx(fxType: string, active: boolean, _targetTrackIndex: number = -1) {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    if (fxType === 'KILL') {
      const targetGain = active ? 0.0 : 0.85;
      this.masterGain.gain.setTargetAtTime(targetGain, now, 0.005);
    } else if (fxType === 'SDL' && this.auxDelay) {
      const feedbackVal = active ? 0.85 : 0.4;
      this.auxDelay.feedback.gain.setTargetAtTime(feedbackVal, now, 0.010);
    }
  }

  public getContextTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}

export const audioEngine = new AudioEngine();
