/**
 * SP-M8x Hybrid Music Production Suite
 * projectTypes.ts — Master Project Schema & Type Definitions
 */

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface ProjectMeta {
  name: string;
  version: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSettings {
  bpm: number;
  masterVolume: number; // 0.0 to 1.0
  swing: number;        // 0 to 100
  timeSignatureNum: number;
  timeSignatureDen: number;
}

export interface SampleAsset {
  id: string;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  // Binary buffer reference stored in runtime audio cache, NOT serialized to JSON
}

export interface SliceDefinition {
  id: string;
  startSample: number;
  endSample: number;
  cuePoint: number;
}

export interface PadAssignment {
  id: string;
  bank: BankId;
  padIndex: number; // 0 to 15
  sampleAssetId: string | null;
  sliceId: string | null;
  pitchOffset: number; // Semitones
  volume: number;      // 0.0 to 1.0
  pan: number;         // -1.0 to 1.0
  loopMode: 'none' | 'forward' | 'toggle';
}

export interface SamplerModel {
  sampleAssets: Record<string, SampleAsset>;
  padBanks: Record<BankId, PadAssignment[]>;
}

export interface TrackerStep {
  row: number;
  note: string;       // e.g., "C-4", "---"
  velocity: number;   // 0 to 127
  instrument: number; // Hex or index
  command: string;    // e.g., "PIT", "VOL", "---"
  value: number;      // Command parameter value
  // Table columns (Unified Tracker Model)
  tableVolume?: number;
  tablePitch?: number;
  tableCommand?: string;
  tableValue?: number;
}

export interface TrackerPattern {
  id: string;
  name: string;
  length: number; // e.g., 16, 32, 64
  steps: TrackerStep[];
}

export interface TrackerModel {
  activePatternIndex: number;
  patterns: TrackerPattern[];
}

export interface SongTrack {
  id: string;
  name: string;
  rows: string[]; // Array of Pattern IDs or hex references per song row (32 rows)
}

export interface SongArrangement {
  tracks: SongTrack[];
  activeRow: number;
}

export interface MasterTransport {
  isPlaying: boolean;
  isRecording: boolean;
  currentSongRow: number;
  currentPatternStep: number;
  activeTrackIndex: number;
  playbackMode: 'pattern' | 'song';
}

export interface EffectsModel {
  punchInFxEnabled: boolean;
  masterFilterCutoff: number;
  masterDelayFeedback: number;
  masterReverbMix: number;
}

export interface SPProject {
  meta: ProjectMeta;
  settings: ProjectSettings;
  sampler: SamplerModel;
  tracker: TrackerModel;
  song: SongArrangement;
  effects: EffectsModel;
  transport: MasterTransport;
}

// --- Backward Compatibility & Controller Aliases ---
export type Project = SPProject;
export type SamplerState = SamplerModel;
export type TrackerState = TrackerModel;
export type SongState = SongArrangement;
export type TransportState = MasterTransport;
export type Pad = PadAssignment;
