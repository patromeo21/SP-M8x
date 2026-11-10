/**
 * SP-M8x Hybrid Sampler & Tracker Architecture
 * Centralized Type Definitions
 */

export type ThemeMode = 'default' | 'pink-arranger' | 'retro-synth' | 'monochrome';

export type SamplerMode = 'SAMPLE_TRIGGER' | 'MPC_CHROMATIC';

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface Pad {
  id: number; // Pad index 0 - 15 (16 pads total)
  name: string;
  buffer: AudioBuffer | null;
  sliceStart: number; // Slice start point in seconds
  sliceEnd: number; // Slice end point in seconds
  volume: number; // 0.0 to 1.0
  pan: number; // -1.0 to 1.0
  pitchOffset: number; // Local semitone shift (-12 to +12)
  reverse: boolean;
  loop: boolean;
  chromaticRootNote: number; // MIDI root note number (e.g., 60 = C4)
}

export interface Bank {
  id: BankId;
  pads: Pad[];
}

export interface PunchInFXState {
  filterCutoff: number; // Hz (20 to 20000)
  filterResonance: number; // Q factor (0.1 to 20)
  delayTime: number; // Delay time in seconds
  delayFeedback: number; // 0.0 to 0.95
  reverbMix: number; // Wet mix 0.0 to 1.0
  bitcrushBits: number; // Bit depth (4 to 16)
  vinylNoise: number; // Noise layer level 0.0 to 1.0
  isolatorLow: number; // Low EQ band gain multiplier
  isolatorMid: number; // Mid EQ band gain multiplier
  isolatorHigh: number; // High EQ band gain multiplier
}

export interface MasterFXState {
  limiterThreshold: number; // dB (-24 to 0)
  compressorRatio: number; // Gain compression ratio (1 to 20)
  masterVolume: number; // Master output volume 0.0 to 1.0
}

export interface TrackerStep {
  row: number; // Step row index (0 - 63)
  note: string; // Pitch identifier (e.g., "C-4", "D#3", "---")
  instrument: number; // Associated Pad/Instrument ID (0 to 15)
  volume: number; // Step velocity / volume (0 to 63 hex/dec representation)
  command: string; // M8-style FX command (e.g., "AR", "FL", "VO", "--")
  value: number; // Command parameter value
}

export interface TrackerPattern {
  id: number;
  length: number; // Total step length (default 64 steps)
  steps: TrackerStep[];
}

export interface TableRow {
  command: string;
  value: number;
}
