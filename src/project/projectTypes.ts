/**
 * SP-M8x Hybrid Music Production Suite
 * projectTypes.ts — Master Project Schema & Type Definitions
 */

export type BankId = 'A' | 'B' | 'C' | 'D';

export const PROJECT_SCHEMA_VERSION = 1;

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettings {
  bpm: number;
  masterVolume: number; // 0.0 to 1.0
  samplerMode: 'SAMPLE_TRIGGER' | string;
  theme: string;
  swing?: number;
  timeSignatureNum?: number;
  timeSignatureDen?: number;
}

export interface SampleAsset {
  id: string;
  name: string;
  originalFilename: string | null;
  mimeType: string | null;
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
  storageKey: string | null;
}

export interface SliceDefinition {
  id: string;
  sampleAssetId: string;
  startSeconds: number;
  endSeconds: number;
}

export interface PadAssignment {
  id: string;
  bank: BankId;
  slot: number; // 0 to 15
  name: string;
  sampleAssetId: string | null;
  sliceId: string | null;
  sliceStartSeconds: number;
  sliceEndSeconds: number | null;
  volume: number;      // 0.0 to 1.0
  pan: number;         // -1.0 to 1.0
  reverse: boolean;
  loop: boolean;
  chromaticRootNote: number;
  pitchOffset: number; // Semitones
}

export interface TrackerStepItem {
  id: string;
  stepIndex: number;
  subTickOffset: number; // 0 to 5 ticks for micro-timing / groove translation
  note: string;       // e.g., "C-4", "---"
  velocity: number;   // 0 to 127
  instrumentAssignmentId: string | null;
  phraseFx: string;   // Command string (e.g., filter, delay, bitcrush)
  phraseFxValue: number;
  tableVolume: number | null;
  tablePitch: number | null;
  tableFx: string;
  tableFxValue: number;
}

export interface ProjectPattern {
  id: string;
  name: string;
  length: number;     // e.g., 16, 32, 64
  steps: TrackerStepItem[];
}

export interface SongCell {
  patternId: string | null;
}

export interface SongTrack {
  id: string;
  name: string;
  rows: SongCell[]; // 32 rows per track
}

export interface SongArrangementState {
  rowCount: number;
  tracks: SongTrack[]; // 8 tracks
}

export interface PunchInEffectsState {
  filterCutoff: number;
  filterResonance: number;
  delayTime: number;
  delayFeedback: number;
  reverbMix: number;
  bitcrushBits: number;
  vinylNoise: number;
  isolatorLow: number;
  isolatorMid: number;
  isolatorHigh: number;
}

export interface MasterEffectsState {
  limiterThreshold: number;
  compressorRatio: number;
  masterVolume: number;
}

export interface EffectsProjectState {
  punchIn: PunchInEffectsState;
  master: MasterEffectsState;
}

export interface SPProject {
  schemaVersion: number;
  metadata: ProjectMetadata;
  settings: ProjectSettings;
  sampler: {
    assets: SampleAsset[];
    slices: SliceDefinition[];
    assignments: PadAssignment[];
  };
  tracker: {
    patterns: ProjectPattern[];
  };
  song: SongArrangementState;
  effects: EffectsProjectState;
}

// --- Legacy Migration Input Types ---
export interface LegacyPadInput {
  id: number;
  name?: string;
  buffer?: {
    duration: number;
    sampleRate: number;
    numberOfChannels: number;
  };
  sliceStart?: number;
  sliceEnd?: number;
  volume?: number;
  pan?: number;
  reverse?: boolean;
  loop?: boolean;
  chromaticRootNote?: number;
  pitchOffset?: number;
}

export interface LegacyStepInput {
  note?: string;
  volume?: number;
  instrument: number;
  command?: string;
  value?: number;
}

export interface LegacyPatternInput {
  id: number;
  length?: number;
  steps: LegacyStepInput[];
}

export interface LegacyProjectInput {
  now?: string;
  projectId?: string;
  projectName?: string;
  bpm?: number;
  samplerMode?: string;
  theme?: string;
  pads: LegacyPadInput[];
  pattern?: LegacyPatternInput;
  punchInFX?: Partial<PunchInEffectsState>;
  masterFX?: Partial<MasterEffectsState>;
}