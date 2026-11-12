/**
 * SP-M8x Hybrid Music Production Suite
 * audioEngine.ts — Web Audio API Core Engine & Polyphonic Voice Allocation
 */

import { audioCache } from './audioCache';

export interface ActiveVoice {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  padId: string | number;
  startTime: number;
}

const normalizePadKey = (padId: string | number): string => String(padId);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeVoices: Map<string, ActiveVoice> = new Map();
  private buffers: Map<string, AudioBuffer> = new Map();

  constructor() {
    // Lazy initialization on user interaction to comply with browser audio policies.
  }

  public initialize(context?: AudioContext): AudioContext {
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.ctx = context || new AudioContextClass({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const context = this.initialize();
    return await context.decodeAudioData(arrayBuffer.slice(0));
  }

  public setPadBuffer(padId: string | number, buffer: AudioBuffer): void {
    const key = normalizePadKey(padId);
    this.buffers.set(key, buffer);
    audioCache.set(key, buffer);
  }

  public getPadBuffer(padId: string | number): AudioBuffer | undefined {
    const key = normalizePadKey(padId);
    if (this.buffers.has(key)) {
      return this.buffers.get(key);
    }
    return audioCache.get(key);
  }

  public triggerPad(
    padId: string | number,
    options: {
      sliceStart?: number;
      sliceEnd?: number;
      volume?: number;
      semitoneOffset?: number;
      loop?: boolean;
    } = {},
  ): string | null {
    const normalizedId = normalizePadKey(padId);
    const context = this.initialize();
    const buffer = this.getPadBuffer(normalizedId);

    if (!buffer || !this.masterGain) return null;

    const {
      sliceStart = 0,
      sliceEnd = buffer.duration,
      volume = 1.0,
      semitoneOffset = 0,
      loop = false,
    } = options;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    const playbackRate = Math.pow(2, semitoneOffset / 12);
    source.playbackRate.value = Math.max(0.0625, Math.min(16.0, playbackRate));

    const voiceGain = context.createGain();
    voiceGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), context.currentTime);

    source.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    const duration = sliceEnd - sliceStart;
    const safeStart = Math.max(0, Math.min(sliceStart, buffer.duration));
    const safeDuration = Math.max(0.01, Math.min(duration, buffer.duration - safeStart));

    const voiceId = `spm8x_${normalizedId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const activeVoice: ActiveVoice = {
      source,
      gainNode: voiceGain,
      padId: normalizedId,
      startTime: context.currentTime,
    };

    this.activeVoices.set(voiceId, activeVoice);

    source.onended = () => {
      try {
        source.disconnect();
        voiceGain.disconnect();
      } catch {
        // Already disconnected.
      }
      this.activeVoices.delete(voiceId);
    };

    try {
      if (safeStart > 0 || safeDuration < buffer.duration) {
        source.start(context.currentTime, safeStart, safeDuration);
      } else {
        source.start(context.currentTime);
      }
    } catch (error) {
      console.error('[SP-M8x AudioEngine] triggerPad exception:', error);
      this.activeVoices.delete(voiceId);
      return null;
    }

    return voiceId;
  }

  public triggerVoice(padId: string | number, buffer?: AudioBuffer, pan: number = 0): void {
    const normalizedId = normalizePadKey(padId);
    const context = this.initialize();
    const selectedBuffer = buffer ?? this.getPadBuffer(normalizedId);

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
    voiceGain.gain.setValueAtTime(1.0, context.currentTime);

    source.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    const voiceId = `voice_${normalizedId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.activeVoices.set(voiceId, {
      source,
      gainNode: voiceGain,
      padId: normalizedId,
      startTime: context.currentTime,
    });

    source.onended = () => {
      this.activeVoices.delete(voiceId);
    };

    try {
      source.start(0);
    } catch (error) {
      console.error('[SP-M8x AudioEngine] triggerVoice exception:', error);
      this.activeVoices.delete(voiceId);
    }
  }

  public stopVoice(target: string | number): void {
    const targetKey = normalizePadKey(target);

    const directMatch = this.activeVoices.get(targetKey);
    if (directMatch) {
      try {
        directMatch.source.stop();
        directMatch.source.disconnect();
        directMatch.gainNode.disconnect();
      } catch {
        // Already stopped.
      }
      this.activeVoices.delete(targetKey);
      return;
    }

    const matchEntry = Array.from(this.activeVoices.entries()).find(([, voice]) => {
      return normalizePadKey(voice.padId) === targetKey;
    });

    if (!matchEntry) return;

    const [voiceId, voice] = matchEntry;
    try {
      voice.source.stop();
      voice.source.disconnect();
      voice.gainNode.disconnect();
    } catch {
      // Ignore already-ended voice cleanup.
    }
    this.activeVoices.delete(voiceId);
  }

  public stopAllVoices(): void {
    for (const voiceId of this.activeVoices.keys()) {
      const voice = this.activeVoices.get(voiceId);
      if (!voice) continue;
      try {
        voice.source.stop();
        voice.source.disconnect();
        voice.gainNode.disconnect();
      } catch {
        // Ignore if already stopped.
      }
      this.activeVoices.delete(voiceId);
    }
  }

  public setMasterVolume(volume: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, volume)),
        this.ctx.currentTime,
        0.01,
      );
    }
  }
}

export const audioEngine = new AudioEngine();
export default audioEngine;
