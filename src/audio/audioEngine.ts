// FILE: src/audio/audioEngine.ts
/**
 * SP-M8x Core Web Audio Engine (Canonical Single Source of Truth)
 * Precision-typed singleton providing AudioContext lifecycle management,
 * lookahead scheduled voice playback, master brickwall limiting, and aux FX routing.
 */

export interface TriggerPadOptions {
  trackIndex?: number;
  volume?: number;
  playbackRate?: number;
  scheduledTime?: number;
  loop?: boolean;
}

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
   * Synchronously creates/retrieves the AudioContext so lookahead schedulers
   * can read currentTime immediately while triggering an async resume.
   */
  public ensureContext(): AudioContext | null {
    if (!this.audioCtx) {
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioContextClass({ sampleRate: 44100 });
        this.setupAudioGraph(this.audioCtx);
        this.isInitialized = true;
      } catch (err) {
        console.error('[AudioEngine] Failed to create AudioContext:', err);
        return null;
      }
    }

    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  public async initialize(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      return true;
    } catch (err) {
      console.error('[AudioEngine] Failed to resume AudioContext:', err);
      return false;
    }
  }

  private setupAudioGraph(ctx: AudioContext): void {
    // Master Gain -> Brickwall Limiter -> Destination (prevents DAC clipping)
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, ctx.currentTime);

    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(0.0, ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(20.0, ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.002, ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.080, ctx.currentTime);

    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(ctx.destination);

    // Aux Delay Bus (SDL) -> Master Gain
    const delayInput = ctx.createGain();
    const delayNode = ctx.createDelay(2.0);
    delayNode.delayTime.setValueAtTime(0.375, ctx.currentTime);
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.setValueAtTime(0.4, ctx.currentTime);
    const delayOutput = ctx.createGain();
    delayOutput.gain.setValueAtTime(0.5, ctx.currentTime);

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

    // 8 Track Channel Strips -> Master Gain
    this.trackStrips = [];
    for (let i = 0; i < 8; i++) {
      const input = ctx.createGain();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, ctx.currentTime);

      let pan: StereoPannerNode | null = null;
      if (ctx.createStereoPanner) {
        pan = ctx.createStereoPanner();
        pan.pan.setValueAtTime(0.0, ctx.currentTime);
        input.connect(gain);
        gain.connect(pan);
        pan.connect(this.masterGain);
      } else {
        input.connect(gain);
        gain.connect(this.masterGain);
      }

      this.trackStrips.push({ input, pan, gain });
    }
  }

  public async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    if (!ctx) {
      throw new Error('AudioContext could not be initialized');
    }
    return await ctx.decodeAudioData(arrayBuffer);
  }

  public setPadBuffer(padId: string | number, buffer: AudioBuffer, _options?: unknown): string | null {
    this.padBuffers.set(padId, buffer);
    return String(padId);
  }

  public getPadBuffer(padId: string | number): AudioBuffer | undefined {
    return this.padBuffers.get(padId);
  }

  public setMasterVolume(volume: number): void {
    if (!this.audioCtx || !this.masterGain) return;
    const clamped = Math.max(0, Math.min(1.2, volume));
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
    trackIndexOrOptions?: number | TriggerPadOptions,
    volume: number = 1.0,
    playbackRate: number = 1.0
  ): void {
    const buffer = this.padBuffers.get(padId);
    if (!buffer) return;

    const isObj = typeof trackIndexOrOptions === 'object' && trackIndexOrOptions !== null;
    const trackIdx = isObj ? (trackIndexOrOptions.trackIndex ?? 0) : (trackIndexOrOptions ?? 0);
    const vol = isObj ? (trackIndexOrOptions.volume ?? volume) : volume;
    const rate = isObj ? (trackIndexOrOptions.playbackRate ?? playbackRate) : playbackRate;
    const when = isObj ? trackIndexOrOptions.scheduledTime : undefined;
    const loop = isObj ? Boolean(trackIndexOrOptions.loop) : false;

    this.triggerVoice(trackIdx, buffer, rate, vol, when, loop);
  }

  public triggerVoice(
    trackIndex: number,
    buffer: AudioBuffer,
    playbackRate: number = 1.0,
    volume: number = 1.0,
    scheduledTime?: number,
    loop: boolean = false
  ): void {
    const ctx = this.ensureContext();
    const strip = this.trackStrips[trackIndex] ?? this.trackStrips[0];
    if (!ctx || !this.isInitialized || !strip) return;

    try {
      const startTime =
        typeof scheduledTime === 'number' && Number.isFinite(scheduledTime)
          ? Math.max(ctx.currentTime, scheduledTime)
          : ctx.currentTime;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      source.playbackRate.setValueAtTime(playbackRate, startTime);

      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(Math.max(0, Math.min(1.0, volume)), startTime);

      source.connect(voiceGain);
      voiceGain.connect(strip.input);

      source.start(startTime);
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

  public stopVoice(_voiceId?: unknown): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
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

  public applyPunchInFx(fxType: string, active: boolean, _targetTrackIndex: number = -1): void {
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
