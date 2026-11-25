/**
 * SP-M8x Hybrid Music Production Suite
 * fx/fxEngine.ts — Master bus ('A' | 'B' | 'MST'), MST live-only recording guard,
 * and clean live-only FX release restoration
 */

import { holdAudioParam } from './VoiceFxPool';

export type FxBus = 'A' | 'B' | 'MST';
export type RmxBus = FxBus;
export type RmxLength = 1 | 2 | 4;
export type MacroFx = 'off' | 'filter' | 'lofi' | 'chorus' | 'mute';
export type PunchInOpcode = 'PM' | 'LF' | 'BC' | 'OFF';
export type LiveOnlyFxCode = 'syncDelay' | 'subsonic' | 'djfxLooper' | 'tapeStop';
export type GestureMode = 'live-only' | 'recordable';

export interface RmxBusState {
  bus: RmxBus;
  length: RmxLength;
  anchor: number;
}

export interface PunchInGestureContext {
  activeBus: FxBus;
  opcode: PunchInOpcode;
  value?: number;
  isRecordArmed: boolean;
  mode?: GestureMode;
}

export interface LiveFxBaselineSnapshot {
  dryGain: number;
  filterWetGain: number;
  lofiWetGain: number;
  chorusWetGain: number;
  filterFrequency: number;
  delayTimeSec?: number;
  feedbackGain?: number;
  playbackRate?: number;
}

export function normalizeRmxBus(raw: unknown): RmxBus {
  if (raw === 'A' || raw === 'B' || raw === 'MST') return raw;
  return 'MST';
}

export function getBusTrackRange(bus: RmxBus): { firstTrack: number; lastTrack: number } | null {
  if (bus === 'A') return { firstTrack: 0, lastTrack: 3 };
  if (bus === 'B') return { firstTrack: 4, lastTrack: 7 };
  return null;
}

/**
 * Enforces the MST Live-Only Rule:
 * Punch-in FX never write to Phrase steps while MST is active or when tagged 'live-only'.
 */
export function resolveGestureMode(activeBus: FxBus, requestedMode?: GestureMode): GestureMode {
  if (activeBus === 'MST') return 'live-only';
  return requestedMode ?? 'recordable';
}

export function canRecordPunchInToStep(ctx: PunchInGestureContext): boolean {
  const effectiveMode = resolveGestureMode(ctx.activeBus, ctx.mode);
  return ctx.isRecordArmed && ctx.activeBus !== 'MST' && effectiveMode === 'recordable';
}

export function sanitizePunchInOpcode(raw: unknown): PunchInOpcode {
  if (raw === 'PM' || raw === 'LF' || raw === 'BC' || raw === 'OFF') return raw;
  return 'OFF';
}

export function rmxStepIndex(
  stepIndex: number,
  anchorStep: number,
  totalPhraseSteps: number,
  length: RmxLength,
): number {
  const offset = (((stepIndex - anchorStep) % length) + length) % length;
  return (((anchorStep + offset) % totalPhraseSteps) + totalPhraseSteps) % totalPhraseSteps;
}

export class MacroFxBus {
  public readonly input: GainNode;
  private readonly dry: GainNode;
  private readonly filterWet: GainNode;
  private readonly lofiWet: GainNode;
  private readonly chorusWet: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly liveDelay: DelayNode;
  private readonly liveDelayFeedback: GainNode;
  private readonly liveDelayWet: GainNode;
  private readonly subsonicFilter: BiquadFilterNode;
  private readonly subsonicWet: GainNode;
  private activeLiveFx: LiveOnlyFxCode | null = null;
  private baselineSnapshot: LiveFxBaselineSnapshot | null = null;

  constructor(private readonly context: AudioContext, output: AudioNode) {
    this.input = context.createGain();
    this.dry = context.createGain();
    this.filterWet = context.createGain();
    this.lofiWet = context.createGain();
    this.chorusWet = context.createGain();
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;

    const lofi = context.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const sample = (2 * i) / (curve.length - 1) - 1;
      curve[i] = Math.round(sample * 16) / 16;
    }
    lofi.curve = curve;

    const chorus = context.createDelay(0.05);
    chorus.delayTime.value = 0.015;
    const oscillator = context.createOscillator();
    const depth = context.createGain();
    oscillator.frequency.value = 0.8;
    depth.gain.value = 0.004;
    oscillator.connect(depth).connect(chorus.delayTime);
    oscillator.start();

    // Live-only deck/MST bus nodes with hard feedback/safety ceilings
    this.liveDelay = context.createDelay(1.0);
    this.liveDelay.delayTime.value = 0.25;
    this.liveDelayFeedback = context.createGain();
    this.liveDelayFeedback.gain.value = 0;
    this.liveDelayWet = context.createGain();
    this.liveDelayWet.gain.value = 0;
    this.liveDelay.connect(this.liveDelayFeedback).connect(this.liveDelay);

    this.subsonicFilter = context.createBiquadFilter();
    this.subsonicFilter.type = 'lowpass';
    this.subsonicFilter.frequency.value = 90;
    this.subsonicWet = context.createGain();
    this.subsonicWet.gain.value = 0;

    this.dry.gain.value = 1;
    this.filterWet.gain.value = this.lofiWet.gain.value = this.chorusWet.gain.value = 0;

    this.input.connect(this.dry).connect(output);
    this.input.connect(this.filter).connect(this.filterWet).connect(output);
    this.input.connect(lofi).connect(this.lofiWet).connect(output);
    this.input.connect(chorus).connect(this.chorusWet).connect(output);
    this.input.connect(this.liveDelay).connect(this.liveDelayWet).connect(output);
    this.input.connect(this.subsonicFilter).connect(this.subsonicWet).connect(output);
  }

  public setEffect(effect: MacroFx): void {
    const now = this.context.currentTime;
    for (const param of [
      this.dry.gain,
      this.filterWet.gain,
      this.lofiWet.gain,
      this.chorusWet.gain,
      this.filter.frequency,
    ]) {
      holdAudioParam(param, now);
    }

    if (effect === 'mute') {
      this.filter.frequency.setTargetAtTime(20000, now, 0.02);
      this.dry.gain.setTargetAtTime(0, now, 0.002);
      this.filterWet.gain.setTargetAtTime(0, now, 0.002);
      this.lofiWet.gain.setTargetAtTime(0, now, 0.002);
      this.chorusWet.gain.setTargetAtTime(0, now, 0.002);
      return;
    }

    this.filter.frequency.setTargetAtTime(
      effect === 'filter' ? 350 : 20000,
      now,
      effect === 'filter' ? 0.3 : 0.1,
    );
    this.dry.gain.setTargetAtTime(effect === 'off' ? 1 : effect === 'chorus' ? 0.65 : 0, now, 0.002);
    this.filterWet.gain.setTargetAtTime(effect === 'filter' ? 1 : 0, now, 0.002);
    this.lofiWet.gain.setTargetAtTime(effect === 'lofi' ? 1 : 0, now, 0.002);
    this.chorusWet.gain.setTargetAtTime(effect === 'chorus' ? 0.35 : 0, now, 0.002);
  }

  /**
   * Layers a live-only FX gesture over active bus state without mutating grid steps.
   */
  public engageLiveFx(
    fx: LiveOnlyFxCode,
    intensity: number = 0.5,
    time: number = this.context.currentTime,
  ): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 0.5));
    if (!this.baselineSnapshot) {
      this.baselineSnapshot = {
        dryGain: this.dry.gain.value,
        filterWetGain: this.filterWet.gain.value,
        lofiWetGain: this.lofiWet.gain.value,
        chorusWetGain: this.chorusWet.gain.value,
        filterFrequency: this.filter.frequency.value,
        delayTimeSec: this.liveDelay.delayTime.value,
        feedbackGain: this.liveDelayFeedback.gain.value,
      };
    }

    this.activeLiveFx = fx;
    holdAudioParam(this.liveDelay.delayTime, time);
    holdAudioParam(this.liveDelayFeedback.gain, time);
    holdAudioParam(this.liveDelayWet.gain, time);
    holdAudioParam(this.subsonicFilter.frequency, time);
    holdAudioParam(this.subsonicWet.gain, time);
    holdAudioParam(this.dry.gain, time);

    if (fx === 'syncDelay') {
      const delaySec = Math.max(0.0625, Math.min(0.75, 0.125 + clamped * 0.375));
      const fb = Math.max(0, Math.min(0.72, 0.25 + clamped * 0.42));
      this.liveDelay.delayTime.setValueAtTime(delaySec, time);
      this.liveDelayFeedback.gain.setTargetAtTime(fb, time, 0.006);
      this.liveDelayWet.gain.setTargetAtTime(0.3 + clamped * 0.45, time, 0.006);
      return;
    }

    if (fx === 'subsonic') {
      this.subsonicFilter.frequency.setTargetAtTime(55 + clamped * 55, time, 0.008);
      this.subsonicWet.gain.setTargetAtTime(0.25 + clamped * 0.5, time, 0.008);
      return;
    }

    if (fx === 'djfxLooper') {
      this.liveDelay.delayTime.setValueAtTime(Math.max(0.03, 0.25 - clamped * 0.18), time);
      this.liveDelayFeedback.gain.setTargetAtTime(Math.min(0.72, 0.55 + clamped * 0.17), time, 0.004);
      this.liveDelayWet.gain.setTargetAtTime(0.55 + clamped * 0.35, time, 0.004);
      this.dry.gain.setTargetAtTime(Math.max(0.2, 1 - clamped * 0.6), time, 0.004);
      return;
    }

    if (fx === 'tapeStop') {
      this.dry.gain.setTargetAtTime(Math.max(0.02, 1 - clamped * 0.92), time, 0.015);
    }
  }

  /**
   * Cleanly releases the live-only FX layer and restores the captured bus baseline
   * without shifting sequencer clock timing.
   */
  public releaseLiveFx(time: number = this.context.currentTime): void {
    const snap = this.baselineSnapshot;
    this.activeLiveFx = null;
    this.baselineSnapshot = null;

    for (const param of [
      this.dry.gain,
      this.filterWet.gain,
      this.lofiWet.gain,
      this.chorusWet.gain,
      this.filter.frequency,
      this.liveDelay.delayTime,
      this.liveDelayFeedback.gain,
      this.liveDelayWet.gain,
      this.subsonicWet.gain,
    ]) {
      holdAudioParam(param, time);
    }

    this.liveDelayFeedback.gain.setTargetAtTime(0, time, 0.006);
    this.liveDelayWet.gain.setTargetAtTime(0, time, 0.006);
    this.subsonicWet.gain.setTargetAtTime(0, time, 0.006);

    if (snap) {
      this.dry.gain.setTargetAtTime(snap.dryGain, time, 0.008);
      this.filterWet.gain.setTargetAtTime(snap.filterWetGain, time, 0.008);
      this.lofiWet.gain.setTargetAtTime(snap.lofiWetGain, time, 0.008);
      this.chorusWet.gain.setTargetAtTime(snap.chorusWetGain, time, 0.008);
      this.filter.frequency.setTargetAtTime(snap.filterFrequency, time, 0.01);
      if (typeof snap.delayTimeSec === 'number') {
        this.liveDelay.delayTime.setTargetAtTime(snap.delayTimeSec, time, 0.008);
      }
    } else {
      this.dry.gain.setTargetAtTime(1, time, 0.008);
    }
  }

  public getActiveLiveFx(): LiveOnlyFxCode | null {
    return this.activeLiveFx;
  }
}