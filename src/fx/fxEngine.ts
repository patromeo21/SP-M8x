/**
 * SP-M8x Hybrid Music Production Suite
 * fx/fxEngine.ts — Master bus ('A' | 'B' | 'MST') and RMX routing types
 */

import { holdAudioParam } from './VoiceFxPool';

export type FxBus = 'A' | 'B' | 'MST';
export type RmxBus = FxBus;
export type RmxLength = 1 | 2 | 4;
export type MacroFx = 'off' | 'filter' | 'lofi' | 'chorus' | 'mute';

export interface RmxBusState {
  bus: RmxBus;
  length: RmxLength;
  anchor: number;
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

export class MacroFxBus {
  public readonly input: GainNode;
  private readonly dry: GainNode;
  private readonly filterWet: GainNode;
  private readonly lofiWet: GainNode;
  private readonly chorusWet: GainNode;
  private readonly filter: BiquadFilterNode;

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

    this.dry.gain.value = 1;
    this.filterWet.gain.value = this.lofiWet.gain.value = this.chorusWet.gain.value = 0;
    this.input.connect(this.dry).connect(output);
    this.input.connect(this.filter).connect(this.filterWet).connect(output);
    this.input.connect(lofi).connect(this.lofiWet).connect(output);
    this.input.connect(chorus).connect(this.chorusWet).connect(output);
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
