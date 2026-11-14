/**
 * SP-M8x Hybrid Music Production Suite
 * audioEngine.ts — Single Web Audio API authority, polyphonic voice manager, and scheduled playback
 */

import { audioCache } from './audioCache';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface ActiveVoice {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  panner?: StereoPannerNode;
  padId: string;
  startTime: number;
  offset: number;
  end: number;
  loop: boolean;
  playbackRate: number;
}

const normalizePadKey = (padId: string | number): string => String(padId);
const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private outputMeters: [AnalyserNode, AnalyserNode] | null = null;
  private meterSamples = new Float32Array(2048);
  private masterVolume = 0.8;
  private activeVoices = new Map<string, ActiveVoice>();
  private voiceListeners = new Set<() => void>();

  /** Lazily create the one app AudioContext and request resume after user interaction. */
  public async initialize(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported in this browser.');
      }

      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      const splitter = this.ctx.createChannelSplitter(2);
      const left = this.ctx.createAnalyser();
      const right = this.ctx.createAnalyser();
      left.fftSize = right.fftSize = this.meterSamples.length;
      this.masterGain.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);
      this.outputMeters = [left, right];
    }

    const state: string = this.ctx.state;
    if (state === 'suspended' || state === 'interrupted') {
      await this.ctx.resume();
    }
    if (this.ctx.state !== 'running') {
      throw new Error(`AudioContext is ${this.ctx.state}; audio playback is unavailable.`);
    }

    return this.ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getActiveVoiceCount(): number {
    return this.activeVoices.size;
  }

  public subscribeVoiceChanges(listener: () => void): () => void {
    this.voiceListeners.add(listener);
    return () => { this.voiceListeners.delete(listener); };
  }

  public hasPadVoices(padId: string, buffer: AudioBuffer): boolean {
    for (const voice of this.activeVoices.values()) {
      if (voice.padId === padId && voice.source.buffer === buffer) return true;
    }
    return false;
  }

  /** Position of the most recently triggered sounding voice for this exact buffer. */
  public getPadPlaybackPosition(padId: string, buffer: AudioBuffer): number | null {
    const context = this.ctx;
    if (!context || context.state !== 'running') return null;
    let position: number | null = null;
    for (const voice of this.activeVoices.values()) {
      if (voice.padId !== padId || voice.source.buffer !== buffer || context.currentTime < voice.startTime) continue;
      const elapsed = (context.currentTime - voice.startTime) * voice.playbackRate;
      const length = voice.end - voice.offset;
      if (length <= 0 || (!voice.loop && elapsed >= length)) continue;
      position = voice.offset + (voice.loop ? elapsed % length : elapsed);
    }
    return position;
  }

  public async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const context = await this.initialize();
    return context.decodeAudioData(arrayBuffer.slice(0));
  }

  public setPadBuffer(padId: string | number, buffer: AudioBuffer): void {
    audioCache.set(normalizePadKey(padId), buffer);
  }

  public clearPadBuffer(padId: string | number): void {
    audioCache.remove(normalizePadKey(padId));
  }

  public getPadBuffer(padId: string | number): AudioBuffer | undefined {
    return audioCache.get(normalizePadKey(padId));
  }

  public triggerPad(
    padId: string | number,
    options: {
      sliceStart?: number;
      sliceEnd?: number;
      volume?: number;
      semitoneOffset?: number;
      loop?: boolean;
      scheduledTime?: number; // Added to support lookahead sample-accurate scheduling
    } = {},
  ): string | null {
    const context = this.ctx;
    const buffer = this.getPadBuffer(padId);
    if (!context || context.state !== 'running' || !buffer || !this.masterGain) return null;

    const sliceStart = clamp(options.sliceStart ?? 0, 0, buffer.duration);
    const sliceEnd = clamp(options.sliceEnd ?? buffer.duration, 0, buffer.duration);
    if (sliceEnd <= sliceStart) return null;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;

    const duration = sliceEnd - sliceStart;
    if (source.loop) {
      source.loopStart = sliceStart;
      source.loopEnd = sliceEnd;
    }

    const semitones = clamp(options.semitoneOffset ?? 0, -48, 48);
    source.playbackRate.value = Math.pow(2, semitones / 12);

    const voiceGain = context.createGain();
    const targetGainTime = options.scheduledTime ?? context.currentTime;
    voiceGain.gain.setValueAtTime(clamp(options.volume ?? 1, 0, 1), targetGainTime);
    
    source.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    return this.startVoice(
      source,
      voiceGain,
      normalizePadKey(padId),
      sliceStart,
      duration,
      source.loop,
      options.scheduledTime,
    );
  }

  /** Legacy named-voice entry point; each call creates an independently tracked voice. */
  public async triggerVoice(padId: string | number, buffer?: AudioBuffer, pan = 0): Promise<void> {
    const context = await this.initialize();
    if (buffer) this.setPadBuffer(padId, buffer);
    const selectedBuffer = buffer ?? this.getPadBuffer(padId);
    if (!this.masterGain) return;

    const source = context.createBufferSource();
    if (selectedBuffer) {
      source.buffer = selectedBuffer;
    } else {
      const fallbackBuffer = context.createBuffer(1, context.sampleRate * 0.1, context.sampleRate);
      const data = fallbackBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.sin(i * 0.2) * Math.exp(-i / (context.sampleRate * 0.02));
      }
      source.buffer = fallbackBuffer;
    }

    const voiceGain = context.createGain();
    voiceGain.gain.setValueAtTime(1, context.currentTime);

    const safePan = clamp(pan, -1, 1);
    let panner: StereoPannerNode | undefined;
    if (typeof context.createStereoPanner === 'function') {
      panner = context.createStereoPanner();
      panner.pan.setValueAtTime(safePan, context.currentTime);
      source.connect(voiceGain);
      voiceGain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      source.connect(voiceGain);
      voiceGain.connect(this.masterGain);
    }

    this.startVoice(source, voiceGain, normalizePadKey(padId), 0, undefined, false, undefined, panner);
  }

  /** Stop a returned voice ID, or all active voices belonging to the supplied pad ID. */
  public stopVoice(target: string | number): void {
    const key = normalizePadKey(target);
    const exactVoice = this.activeVoices.get(key);
    if (exactVoice) {
      this.releaseVoice(key, exactVoice);
      return;
    }

    for (const [voiceId, voice] of this.activeVoices) {
      if (voice.padId === key) this.releaseVoice(voiceId, voice);
    }
  }

  public stopAllVoices(): void {
    for (const [voiceId, voice] of this.activeVoices) {
      this.releaseVoice(voiceId, voice);
    }
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = clamp(volume, 0, 1);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.01);
    }
  }

  /** Latest analyser window only; short peaks between reads can be missed. */
  public getOutputPeak(): number {
    if (!this.outputMeters || this.ctx?.state !== 'running') return 0;
    let peak = 0;
    for (const meter of this.outputMeters) {
      meter.getFloatTimeDomainData(this.meterSamples);
      for (let i = 0; i < this.meterSamples.length; i++) {
        peak = Math.max(peak, Math.abs(this.meterSamples[i]));
      }
    }
    return peak;
  }

  private startVoice(
    source: AudioBufferSourceNode,
    gainNode: GainNode,
    padId: string,
    offset: number,
    duration: number | undefined,
    loop: boolean,
    scheduledTime?: number,
    panner?: StereoPannerNode,
  ): string | null {
    const context = this.ctx;
    if (!context) return null;

    const voiceId = `spm8x_${padId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const startTime = scheduledTime !== undefined ? Math.max(context.currentTime, scheduledTime) : context.currentTime;
    const voice: ActiveVoice = {
      source, gainNode, panner, padId, startTime, offset,
      end: duration === undefined ? source.buffer?.duration ?? offset : offset + duration,
      loop, playbackRate: source.playbackRate.value,
    };
    this.activeVoices.set(voiceId, voice);

    source.onended = () => {
      this.disconnectVoice(source, gainNode, panner);
      if (this.activeVoices.delete(voiceId)) this.notifyVoiceChanges();
    };

    try {
      if (loop || duration === undefined) {
        source.start(startTime, offset);
      } else {
        source.start(startTime, offset, duration);
      }
      this.notifyVoiceChanges();
      return voiceId;
    } catch (error) {
      this.activeVoices.delete(voiceId);
      this.disconnectVoice(source, gainNode, panner);
      console.error('[SP-M8x AudioEngine] Could not start voice:', error);
      return null;
    }
  }

  private releaseVoice(voiceId: string, voice: ActiveVoice): void {
    this.activeVoices.delete(voiceId);
    this.notifyVoiceChanges();
    try {
      if (this.ctx) {
        const now = this.ctx.currentTime;
        if (voice.startTime > now) {
          voice.source.stop(now);
          return;
        }
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
        voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.01);
        voice.source.stop(now + 0.01);
      } else {
        voice.source.stop();
      }
    } catch (error) {
      console.warn('[SP-M8x AudioEngine] Could not stop voice:', error);
      this.disconnectVoice(voice.source, voice.gainNode, voice.panner);
    }
  }

  private notifyVoiceChanges(): void {
    for (const listener of this.voiceListeners) {
      try {
        listener();
      } catch (error) {
        console.error('[SP-M8x AudioEngine] Voice listener failed:', error);
      }
    }
  }

  private disconnectVoice(source: AudioBufferSourceNode, gainNode: GainNode, panner?: StereoPannerNode): void {
    try {
      source.disconnect();
      gainNode.disconnect();
      panner?.disconnect();
    } catch {
      // Already disconnected during release or natural completion.
    }
  }
}

export const audioEngine = new AudioEngine();
export default audioEngine;