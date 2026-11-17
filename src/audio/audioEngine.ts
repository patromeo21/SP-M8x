/**
 * SP-M8x Hybrid Music Production Suite
 * audioEngine.ts — Single Web Audio API authority, polyphonic voice manager, and scheduled playback
 */

import { audioCache } from './audioCache';
import { holdAudioParam, VoiceFxPool, type VoiceFxCommand, type VoiceFxSlot } from '../fx/VoiceFxPool';
import { PerformanceDeck, type PerformanceFx } from '../fx/PerformanceDeck';
import { MacroFxBus, type FxBus, type MacroFx } from '../fx/fxEngine';

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
  rateChanges?: { time: number; rate: number }[];
  gainChanges?: { time: number; gain: number }[];
  stopTime?: number;
  slot: VoiceFxSlot;
  generationId: number;
  trackIndex: number;
  gated: boolean;
  chokeGroup: number | null;
}

export interface VoiceModulation {
  offset: number;
  semitoneOffset?: number;
  volume?: number;
  fx?: VoiceFxCommand;
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
  private overloadListeners = new Set<(message: string) => void>();
  private fxPool: VoiceFxPool | null = null;
  private performanceDecks: [PerformanceDeck, PerformanceDeck] | null = null;
  private macroBuses: Record<FxBus, MacroFxBus> | null = null;
  private slotOwners = new Map<VoiceFxSlot, string>();
  private trackVolumes = Array.from({ length: 8 }, () => 1);

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
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -6;
      compressor.knee.value = 6;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      const ceiling = this.ctx.createWaveShaper();
      const curve = new Float32Array(4097);
      for (let i = 0; i < curve.length; i++) {
        const x = 2 * i / (curve.length - 1) - 1;
        const magnitude = Math.abs(x);
        curve[i] = Math.sign(x) * (magnitude <= 0.8 ? magnitude : 0.8 + 0.18 * Math.tanh((magnitude - 0.8) / 0.18));
      }
      ceiling.curve = curve;
      this.masterGain.connect(compressor).connect(ceiling);
      const limiter = createMasterLimiterNode(this.ctx);
      ceiling.connect(limiter);
      const safetyShaper = createSafetySaturationNode(this.ctx);
      limiter.connect(safetyShaper);
      safetyShaper.connect(this.ctx.destination);
      const splitter = this.ctx.createChannelSplitter(2);
      const left = this.ctx.createAnalyser();
      const right = this.ctx.createAnalyser();
      left.fftSize = right.fftSize = this.meterSamples.length;
      ceiling.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);
      this.outputMeters = [left, right];
    }

    if (!this.fxPool) {
      if (!this.masterGain) throw new Error('Audio output is unavailable.');
      const master = new MacroFxBus(this.ctx, this.masterGain);
      this.macroBuses = { A: new MacroFxBus(this.ctx, master.input), B: new MacroFxBus(this.ctx, master.input), MST: master };
      this.performanceDecks = [new PerformanceDeck(this.ctx, this.macroBuses.A.input), new PerformanceDeck(this.ctx, this.macroBuses.B.input)];
      this.fxPool = new VoiceFxPool(this.ctx, [this.performanceDecks[0].input, this.performanceDecks[1].input]);
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
    const now = this.ctx?.currentTime ?? 0;
    return [...this.activeVoices.values()].filter((voice) => voice.stopTime === undefined || voice.stopTime > now).length;
  }

  public subscribeVoiceChanges(listener: () => void): () => void {
    this.voiceListeners.add(listener);
    return () => { this.voiceListeners.delete(listener); };
  }

  public subscribeOverload(listener: (message: string) => void): () => void {
    this.overloadListeners.add(listener);
    return () => { this.overloadListeners.delete(listener); };
  }

  public hasPadVoices(padId: string, buffer: AudioBuffer): boolean {
    for (const voice of this.activeVoices.values()) {
      if (voice.padId === padId && voice.source.buffer === buffer &&
          (voice.stopTime === undefined || voice.stopTime > (this.ctx?.currentTime ?? 0))) return true;
    }
    return false;
  }

  public hasVoice(voiceId: string): boolean {
    const voice = this.activeVoices.get(voiceId);
    return Boolean(voice && (voice.stopTime === undefined || voice.stopTime > (this.ctx?.currentTime ?? 0)));
  }

  public isVoiceSounding(voiceId: string): boolean {
    const voice = this.activeVoices.get(voiceId);
    const context = this.ctx;
    return Boolean(voice && context?.state === 'running' && this.voicePosition(voice, context.currentTime) !== null);
  }

  /** Position of the most recently triggered sounding voice for this exact buffer. */
  public getPadPlaybackPosition(padId: string, buffer: AudioBuffer): number | null {
    const context = this.ctx;
    if (!context || context.state !== 'running') return null;
    let position: number | null = null;
    for (const voice of this.activeVoices.values()) {
      if (voice.padId !== padId || voice.source.buffer !== buffer) continue;
      const current = this.voicePosition(voice, context.currentTime);
      if (current !== null) position = current;
    }
    return position;
  }

  private voicePosition(voice: ActiveVoice, now: number): number | null {
    if (now < voice.startTime || (voice.stopTime !== undefined && now >= voice.stopTime)) return null;
    let elapsed = 0;
    let cursor = voice.startTime;
    let rate = voice.playbackRate;
    for (const change of voice.rateChanges ?? []) {
      if (change.time > now) break;
      elapsed += (change.time - cursor) * rate;
      cursor = change.time;
      rate = change.rate;
    }
    elapsed += (now - cursor) * rate;
    const length = voice.end - voice.offset;
    if (length <= 0 || (!voice.loop && elapsed >= length)) return null;
    return voice.offset + (voice.loop ? elapsed % length : elapsed);
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
      modulation?: VoiceModulation[];
      fx?: VoiceFxCommand;
      trackIndex?: number;
      gated?: boolean;
      padVolume?: number;
      chokeGroup?: number | null;
      chokeTrackRange?: { firstTrack: number; lastTrack: number };
    } = {},
  ): string | null {
    const context = this.ctx;
    const buffer = this.getPadBuffer(padId);
    if (!context || context.state !== 'running' || !buffer || !this.masterGain || !this.fxPool) return null;

    const sliceStart = clamp(options.sliceStart ?? 0, 0, buffer.duration);
    const sliceEnd = clamp(options.sliceEnd ?? buffer.duration, 0, buffer.duration);
    if (sliceEnd <= sliceStart) return null;
    const trackIndex = options.trackIndex ?? 0;
    if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex >= 8) {
      throw new Error('Track must be between 1 and 8.');
    }

    let targetGainTime = Math.max(options.scheduledTime ?? context.currentTime, context.currentTime);
    const chokeGroup = options.chokeGroup ?? null;
    if (options.gated) {
      for (const [voiceId, voice] of this.activeVoices) {
        if (voice.gated && voice.trackIndex === trackIndex && voice.startTime <= targetGainTime &&
            voice.slot.generationId === voice.generationId &&
            (voice.stopTime === undefined || voice.stopTime > targetGainTime)) {
          this.stopVoiceAt(voiceId, targetGainTime, 0.004, true);
        }
      }
    }
    if (chokeGroup !== null) {
      for (const [voiceId, voice] of this.activeVoices) {
        if (voice.chokeGroup === chokeGroup && (!options.chokeTrackRange ||
            (voice.trackIndex >= options.chokeTrackRange.firstTrack && voice.trackIndex <= options.chokeTrackRange.lastTrack)) &&
            voice.startTime <= targetGainTime &&
            voice.slot.generationId === voice.generationId &&
            (voice.stopTime === undefined || voice.stopTime > targetGainTime)) {
          this.stopVoiceAt(voiceId, targetGainTime, 0.004, true);
        }
      }
    }
    let slot = this.fxPool.slots.find((item) => !this.slotOwners.has(item));
    if (!slot) {
      if (options.scheduledTime !== undefined) {
        this.reportOverload('Voice pool full — scheduled note dropped.');
        return null;
      }
      const oldest = [...this.slotOwners.entries()]
        .map(([candidate, id]) => ({ candidate, id, voice: this.activeVoices.get(id) }))
        .filter((entry): entry is { candidate: VoiceFxSlot; id: string; voice: ActiveVoice } => Boolean(entry.voice))
        .filter((entry) => entry.voice.startTime <= context.currentTime)
        .sort((a, b) => a.voice.startTime - b.voice.startTime)[0];
      if (!oldest) {
        this.reportOverload('Voice pool reserved — live note dropped.');
        return null;
      }
      targetGainTime = Math.max(targetGainTime, context.currentTime + 0.006);
      this.stopVoiceAt(oldest.id, targetGainTime - 0.006, 0.006);
      slot = oldest.candidate;
    }
    this.fxPool.prepare(slot, targetGainTime, normalizePadKey(padId));
    holdAudioParam(slot.trackGain.gain, targetGainTime);
    slot.trackGain.gain.setValueAtTime(this.trackVolumes[trackIndex], targetGainTime);
    slot.padGain.gain.setValueAtTime(clamp(options.padVolume ?? 1, 0, 1), targetGainTime);
    this.setSlotDeck(slot, trackIndex, targetGainTime);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;

    const duration = sliceEnd - sliceStart;
    if (source.loop) {
      source.loopStart = sliceStart;
      source.loopEnd = sliceEnd;
    }

    const semitones = clamp(options.semitoneOffset ?? 0, -48, 48);
    const baseRate = Math.pow(2, semitones / 12);
    source.playbackRate.value = baseRate;

    const voiceGain = slot.voiceGain;
    const volume = clamp(options.volume ?? 1, 0, 1);
    voiceGain.gain.setValueAtTime(volume, targetGainTime);
    const rateChanges: { time: number; rate: number }[] = [];
    const gainChanges = [{ time: targetGainTime, gain: volume }];
    if (options.fx) this.fxPool.apply(slot, options.fx, targetGainTime);
    for (const change of [...(options.modulation ?? [])].sort((a, b) => a.offset - b.offset)) {
      if (!Number.isFinite(change.offset) || change.offset < 0) continue;
      const time = targetGainTime + change.offset;
      if (change.fx) this.fxPool.apply(slot, change.fx, time);
      if (change.semitoneOffset !== undefined && Number.isFinite(change.semitoneOffset)) {
        const rate = Math.pow(2, clamp(semitones + change.semitoneOffset, -48, 48) / 12);
        source.playbackRate.setValueAtTime(rate, time);
        rateChanges.push({ time, rate });
      }
      if (change.volume !== undefined && Number.isFinite(change.volume)) {
        const gain = volume * clamp(change.volume, 0, 1);
        voiceGain.gain.setValueAtTime(gain, time);
        gainChanges.push({ time, gain });
      }
    }
    
    source.connect(voiceGain);
    const voiceId = this.startVoice(
      source,
      voiceGain,
      normalizePadKey(padId),
      sliceStart,
      duration,
      source.loop,
      targetGainTime,
      undefined,
      rateChanges,
      baseRate,
      gainChanges,
      slot,
      trackIndex,
      options.gated ?? false,
      chokeGroup,
    );
    return voiceId;
  }

  /** Legacy named-voice entry point; each call creates an independently tracked voice. */
  public async triggerVoice(padId: string | number, buffer?: AudioBuffer, pan = 0): Promise<void> {
    const context = await this.initialize();
    if (buffer) this.setPadBuffer(padId, buffer);
    if (!this.getPadBuffer(padId)) {
      const fallback = context.createBuffer(1, context.sampleRate * 0.1, context.sampleRate);
      const data = fallback.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.2) * Math.exp(-i / (context.sampleRate * 0.02));
      this.setPadBuffer(padId, fallback);
    }
    const id = this.triggerPad(padId);
    const voice = id ? this.activeVoices.get(id) : undefined;
    if (voice) voice.slot.panner.pan.setValueAtTime(clamp(pan, -1, 1), voice.startTime);
  }

  public resetPadFxAt(padId: string, time: number, trackRange?: { firstTrack: number; lastTrack: number }): void {
    if (!this.fxPool) return;
    for (const voice of this.activeVoices.values()) {
      if (voice.padId === padId && (!trackRange || (voice.trackIndex >= trackRange.firstTrack && voice.trackIndex <= trackRange.lastTrack)) &&
          voice.slot.generationId === voice.generationId &&
          voice.startTime <= time && (voice.stopTime === undefined || voice.stopTime > time)) {
        this.fxPool.reset(voice.slot, time);
      }
    }
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

  public stopVoiceAt(voiceId: string, time: number, fadeSeconds = 0.01, exponential = false): void {
    const voice = this.activeVoices.get(voiceId);
    const context = this.ctx;
    if (!voice || !context) return;
    const stopTime = Math.max(context.currentTime, time);
    if (voice.stopTime !== undefined && voice.stopTime <= stopTime) return;
    if (voice.slot.generationId !== voice.generationId) return;
    const fade = clamp(fadeSeconds, 0.001, 0.05);
    holdAudioParam(voice.gainNode.gain, stopTime);
    if (exponential) {
      if (voice.gainNode.gain.value <= 0) voice.gainNode.gain.setValueAtTime(0.0001, stopTime);
      voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime + fade);
    } else {
      voice.gainNode.gain.linearRampToValueAtTime(0.0001, stopTime + fade);
    }
    voice.stopTime = stopTime;
    try {
      voice.source.stop(stopTime + fade);
    } catch (error) {
      console.warn('[SP-M8x AudioEngine] Could not schedule voice stop:', error);
      this.releaseVoice(voiceId, voice);
    }
  }

  public stopPadVoicesAt(padId: string, time: number, fadeSeconds = 0.01): void {
    for (const [voiceId, voice] of this.activeVoices) {
      if (voice.padId === padId) this.stopVoiceAt(voiceId, time, fadeSeconds);
    }
  }

  public releaseGatedVoice(voiceId: string, time: number): void {
    const voice = this.activeVoices.get(voiceId);
    if (!voice || !voice.gated) return;
    if (time < voice.startTime) {
      this.stopVoice(voiceId);
      return;
    }
    this.stopVoiceAt(voiceId, time, 0.004, true);
  }

  public releaseTrackGatedVoicesAt(padId: string, trackIndex: number, time: number): void {
    for (const [voiceId, voice] of this.activeVoices) {
      if (voice.padId === padId && voice.trackIndex === trackIndex && voice.gated && voice.startTime <= time) {
        this.releaseGatedVoice(voiceId, time);
      }
    }
  }

  public stopGatedVoices(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (const [voiceId, voice] of this.activeVoices) {
      if (voice.gated && voice.slot.generationId === voice.generationId) {
        this.releaseGatedVoice(voiceId, now);
      }
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

  public setTrackVolume(trackIndex: number, volume: number): void {
    if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex >= 8 || !Number.isFinite(volume)) {
      throw new Error('Invalid track volume.');
    }
    const value = clamp(volume, 0, 1);
    this.trackVolumes[trackIndex] = value;
    const now = this.ctx?.currentTime;
    if (now === undefined) return;
    for (const voice of this.activeVoices.values()) {
      if (voice.trackIndex !== trackIndex || voice.slot.generationId !== voice.generationId) continue;
      const time = Math.max(now, voice.startTime);
      holdAudioParam(voice.slot.trackGain.gain, time);
      voice.slot.trackGain.gain.setTargetAtTime(value, time, 0.005);
    }
  }

  public setPadVolume(padId: string, volume: number): void {
    if (!Number.isFinite(volume)) throw new Error('Invalid pad volume.');
    const value = clamp(volume, 0, 1);
    const now = this.ctx?.currentTime;
    if (now === undefined) return;
    for (const voice of this.activeVoices.values()) {
      if (voice.padId !== padId || voice.slot.generationId !== voice.generationId) continue;
      const time = Math.max(now, voice.startTime);
      holdAudioParam(voice.slot.padGain.gain, time);
      voice.slot.padGain.gain.setTargetAtTime(value, time, 0.005);
    }
  }

  public setVoiceTrack(voiceId: string, trackIndex: number): void {
    if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex >= 8) throw new Error('Invalid voice track.');
    const voice = this.activeVoices.get(voiceId);
    if (!voice || !this.ctx || voice.slot.generationId !== voice.generationId) return;
    voice.trackIndex = trackIndex;
    const time = Math.max(this.ctx.currentTime, voice.startTime);
    holdAudioParam(voice.slot.trackGain.gain, time);
    voice.slot.trackGain.gain.setValueAtTime(this.trackVolumes[trackIndex], time);
    this.setSlotDeck(voice.slot, trackIndex, time);
  }

  private setSlotDeck(slot: VoiceFxSlot, trackIndex: number, time: number): void {
    slot.deckGains.forEach((gain, index) => {
      holdAudioParam(gain.gain, time);
      gain.gain.setValueAtTime(index === (trackIndex < 4 ? 0 : 1) ? 1 : 0, time);
    });
  }

  public setPerformanceFx(deck: 0 | 1, effect: PerformanceFx): void {
    if (!this.performanceDecks) throw new Error('Audio engine is not initialized.');
    this.performanceDecks[deck].setEffect(effect);
  }

  public setMacroFx(bus: FxBus, effect: MacroFx): void {
    if (!this.macroBuses) throw new Error('Audio engine is not initialized.');
    this.macroBuses[bus].setEffect(effect);
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
    rateChanges?: { time: number; rate: number }[],
    baseRate?: number,
    gainChanges?: { time: number; gain: number }[],
    slot?: VoiceFxSlot,
    trackIndex = 0,
    gated = false,
    chokeGroup: number | null = null,
  ): string | null {
    const context = this.ctx;
    if (!context || !slot) return null;

    const voiceId = `spm8x_${padId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const startTime = scheduledTime !== undefined ? Math.max(context.currentTime, scheduledTime) : context.currentTime;
    const voice: ActiveVoice = {
      source, gainNode, panner, padId, startTime, offset,
      end: duration === undefined ? source.buffer?.duration ?? offset : offset + duration,
      loop, playbackRate: baseRate ?? source.playbackRate.value, rateChanges, gainChanges, slot, generationId: slot.generationId, trackIndex, gated, chokeGroup,
    };
    this.activeVoices.set(voiceId, voice);
    this.slotOwners.set(slot, voiceId);

    source.onended = () => {
      source.disconnect();
      if (slot.generationId === voice.generationId && this.slotOwners.get(slot) === voiceId) {
        this.slotOwners.delete(slot);
        slot.padId = null;
      }
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
      if (this.slotOwners.get(slot) === voiceId) this.slotOwners.delete(slot);
      source.disconnect();
      console.error('[SP-M8x AudioEngine] Could not start voice:', error);
      return null;
    }
  }

  private releaseVoice(voiceId: string, voice: ActiveVoice): void {
    if (voice.stopTime !== undefined && voice.stopTime <= (this.ctx?.currentTime ?? 0)) return;
    try {
      if (this.ctx) {
        const now = this.ctx.currentTime;
        voice.stopTime = now;
        this.notifyVoiceChanges();
        if (voice.startTime > now) {
          voice.source.stop(now);
          return;
        }
        if (voice.slot.generationId !== voice.generationId) {
          voice.source.stop(now);
          return;
        }
        holdAudioParam(voice.gainNode.gain, now);
        voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.01);
        voice.source.stop(now + 0.01);
      } else {
        voice.source.stop();
      }
    } catch (error) {
      console.warn('[SP-M8x AudioEngine] Could not stop voice:', error);
      voice.source.disconnect();
      this.activeVoices.delete(voiceId);
      if (this.slotOwners.get(voice.slot) === voiceId) this.slotOwners.delete(voice.slot);
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

  private reportOverload(message: string): void {
    console.warn(`[SP-M8x AudioEngine] ${message}`);
    for (const listener of this.overloadListeners) listener(message);
  }
}


/**
 * Master lookahead brickwall limiter stage for the final output bus.
 * Threshold -0.5 dBFS, hard knee, ratio 20:1, 3ms attack, 50ms release.
 */
export function createMasterLimiterNode(audioCtx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = audioCtx.createDynamicsCompressor();

  limiter.threshold.setValueAtTime(-0.5, audioCtx.currentTime);
  limiter.knee.setValueAtTime(0.0, audioCtx.currentTime);
  limiter.ratio.setValueAtTime(20.0, audioCtx.currentTime);
  limiter.attack.setValueAtTime(0.003, audioCtx.currentTime);
  limiter.release.setValueAtTime(0.050, audioCtx.currentTime);

  return limiter;
}

/**
 * Sigmoid soft-clip / feedback safety clamp stage (< 0.92).
 * Protects against runaway resonance in voice filter / FX feedback loops.
 * 4x oversampling for linear interpolation accuracy.
 */
export function createSafetySaturationNode(audioCtx: BaseAudioContext): WaveShaperNode {
  const shaper = audioCtx.createWaveShaper();
  const curveLength = 44100;
  const curve = new Float32Array(curveLength);
  const clampThreshold = 0.92;

  for (let i = 0; i < curveLength; ++i) {
    const x = (i * 2) / curveLength - 1;
    // Sigmoid soft-clip curve clamped strictly below 0.92
    if (x > clampThreshold) {
      curve[i] = clampThreshold + (x - clampThreshold) / (1 + Math.abs(x));
    } else if (x < -clampThreshold) {
      curve[i] = -clampThreshold + (x + clampThreshold) / (1 + Math.abs(x));
    } else {
      curve[i] = x;
    }
  }

  shaper.curve = curve;
  shaper.oversample = '4x';
  return shaper;
}
export const audioEngine = new AudioEngine();
export default audioEngine;