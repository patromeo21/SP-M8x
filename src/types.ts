/**
 * SP-M8x Centralized Type Definitions
 * types.ts — Sampler, FX, Tracker, and Theme interfaces
 */

export type ThemeMode = 'default' | 'pink-arranger' | 'retro-synth' | 'monochrome';

export type SamplerMode = 'SAMPLE_TRIGGER' | 'MPC_CHROMATIC';

export type BankId = 'A' | 'B' | 'C' | 'D';

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
