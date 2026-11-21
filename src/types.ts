/**
 * SP-M8x Centralized Type Definitions
 * types.ts — Sampler, FX, Tracker, and Theme interfaces
 */

export type ThemeMode = 'default' | 'pink-arranger' | 'retro-synth' | 'monochrome';

export type SamplerMode = 'SAMPLE_TRIGGER' | 'MPC_CHROMATIC';

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface AdsrEnvelope {
  /** Attack time in milliseconds (0 = raw transient pass-through). */
  attackMs: number;
  /** Decay time in milliseconds from peak to sustain gain. */
  decayMs: number;
  /** Sustain gain ratio in [0, 1]. */
  sustain: number;
  /** Release time in milliseconds on gate release or stop/choke. */
  releaseMs: number;
}

export interface AdsrEnvelopeBounds {
  minAttackMs: number;
  maxAttackMs: number;
  minDecayMs: number;
  maxDecayMs: number;
  minSustain: number;
  maxSustain: number;
  minReleaseMs: number;
  maxReleaseMs: number;
}

export const ADSR_BOUNDS: AdsrEnvelopeBounds = {
  minAttackMs: 0,
  maxAttackMs: 2000,
  minDecayMs: 1,
  maxDecayMs: 5000,
  minSustain: 0,
  maxSustain: 1,
  minReleaseMs: 1,
  maxReleaseMs: 5000,
};

/** Hardware-default envelope preserves raw transients and full sustain. */
export const DEFAULT_HARDWARE_ADSR: Readonly<AdsrEnvelope> = Object.freeze({
  attackMs: 0,
  decayMs: 120,
  sustain: 1,
  releaseMs: 15,
});

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function normalizeAdsrEnvelope(raw?: Partial<AdsrEnvelope> | null): AdsrEnvelope {
  return {
    attackMs: clampFinite(raw?.attackMs, ADSR_BOUNDS.minAttackMs, ADSR_BOUNDS.maxAttackMs, DEFAULT_HARDWARE_ADSR.attackMs),
    decayMs: clampFinite(raw?.decayMs, ADSR_BOUNDS.minDecayMs, ADSR_BOUNDS.maxDecayMs, DEFAULT_HARDWARE_ADSR.decayMs),
    sustain: clampFinite(raw?.sustain, ADSR_BOUNDS.minSustain, ADSR_BOUNDS.maxSustain, DEFAULT_HARDWARE_ADSR.sustain),
    releaseMs: clampFinite(raw?.releaseMs, ADSR_BOUNDS.minReleaseMs, ADSR_BOUNDS.maxReleaseMs, DEFAULT_HARDWARE_ADSR.releaseMs),
  };
}

export interface Pad {
  id: number;
  name: string;
  buffer: AudioBuffer | null;
  sliceStart: number; // in seconds
  sliceEnd: number; // in seconds
  volume: number; // 0.0 to 1.0
  pan: number; // -1.0 to 1.0
  reverse: boolean;
  loop: boolean;
  chromaticRootNote: number; // MIDI note number, e.g., 60 (C4)
  pitchOffset?: number; // Semitone pitch offset for MPC chromatic mode (-12 to +12)
  adsr?: AdsrEnvelope;
}

export interface PunchInFXState {
  filterCutoff: number; // Hz (20 to 20000)
  filterResonance: number; // 0.1 to 20
  delayTime: number; // seconds
  delayFeedback: number; // 0.0 to 0.95
  reverbMix: number; // 0.0 to 1.0
  bitcrushBits: number; // 4 to 16
  vinylNoise: number; // 0.0 to 1.0
  isolatorLow: number; // gain multiplier
  isolatorMid: number; // gain multiplier
  isolatorHigh: number; // gain multiplier
}

export interface MasterFXState {
  limiterThreshold: number; // dB (-24 to 0)
  compressorRatio: number; // 1 to 20
  masterVolume: number; // 0.0 to 1.0
}

export interface TrackerStep {
  row: number;
  note: string; // e.g., "C-4", "---"
  instrument: number; // pad/instrument id (0 to 15)
  volume: number; // 0 to 63 (M8 style hex/dec)
  command: string; // e.g., "AR", "FL", "VO", "--"
  value: number; // parameter value
}

export interface TrackerPattern {
  id: number;
  length: number; // e.g., 64 steps
  steps: TrackerStep[];
}

export interface TableRow {
  command: string;
  value: number;
}
