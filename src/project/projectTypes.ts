/**
 * SP-M8x Project Data Types
 * Supports 32-step phrases, dual FX slots, SUB micro-timing, Table FX latches,
 * and comprehensive optional legacy properties for 100% clean builds across existing reducers and helpers.
 */

export const PROJECT_SCHEMA_VERSION = '1.1.0';

export type StepNote = string | null; // e.g., "C-4", "OFF", null
export type InstrumentId = string | null; // e.g., "A01"
export type VolumeValue = number | null; // 0x00 to 0x7F

export interface StepFxCommand {
  opcode: string; // e.g., "STA", "PIT", "PAN", "VOL", "REP", "HOP", "CHA", "---"
  value: number;  // 0x00 to 0xFF
}

export interface StepData {
  stepIndex: number; // 0 to 31 (2 bars / 32 steps)
  note: StepNote;
  instrument: InstrumentId;
  volume: VolumeValue;
  fx1: StepFxCommand;
  fx2: StepFxCommand;
  sub: number; // 0 to 7 micro-timing / delay offset
  // Optional legacy compatibility properties
  id?: string;
  subTickOffset?: number;
  instrumentAssignmentId?: string;
  [key: string]: any;
}

export interface TableFxLatch {
  id: string;
  fxType: 'KILL' | 'RET' | 'CUT' | 'DEG' | 'SDL';
  targetTrack: number; // 0 to 7 (or -1 for Master Bus)
  engageStep: number;  // 0 to 31
  engageSub: number;   // 0 to 7
  releaseStep: number; // 0 to 31
  releaseSub: number;  // 0 to 7
  parameterValues?: number[]; // Captured control knob values during hold
}

export interface TableRow {
  rowIndex: number; // 0 to 15
  command: string;  // e.g., "STA", "PIT", "VOL", "---"
  value: number;
}

export interface PhraseData {
  id: string;
  name: string;
  steps: StepData[]; // Exactly 32 steps per phrase
  tableLatches: TableFxLatch[];
  tableRows: TableRow[];
  // Optional legacy compatibility properties
  length?: number;
  [key: string]: any;
}

export interface TrackData {
  trackIndex: number; // 0 to 7
  name: string;
  volume: number; // 0.0 to 1.0
  pan: number;    // -1.0 to 1.0
  muted: boolean;
  soloed: boolean;
  activePhraseId: string;
  [key: string]: any;
}

export interface ProjectSettings {
  bpm: number;
  swing: number;
  masterVolume?: number;
  [key: string]: any;
}

export interface SampleAsset {
  id: string;
  name: string;
  url?: string;
  buffer?: AudioBuffer;
  originalFilename?: string;
  [key: string]: any;
}

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface PadAssignment {
  padId: number; // 1 to 16
  bank: BankId;
  sampleId: string | null;
  name: string;
  volume: number;
  pitch: number;
  // Optional legacy compatibility properties
  id?: string;
  slot?: number;
  loop?: boolean;
  chromaticRootNote?: number;
  [key: string]: any;
}

export interface ProjectData {
  version: string;
  bpm: number;
  swing: number;
  tracks: TrackData[]; // Exactly 8 tracks
  phrases: Record<string, PhraseData>;
  instruments: Record<string, any>;
  
  // Optional legacy compatibility properties referenced by reducers/migrators/selectors
  schemaVersion?: string;
  metadata?: any;
  settings?: ProjectSettings;
  sampler?: {
    banks?: Record<BankId, PadAssignment[]>;
    pads?: PadAssignment[];
    [key: string]: any;
  };
  tracker?: {
    patterns?: Record<string, PhraseData>;
    [key: string]: any;
  };
  song?: {
    tracks?: TrackData[];
    [key: string]: any;
  };
  effects?: {
    punchIn?: any;
    master?: any;
    [key: string]: any;
  };
  punchIn?: any;
  master?: any;
  [key: string]: any;
}

// --- Backward Compatibility Aliases for Legacy Modules ---
export type SPProject = ProjectData;
export type EffectsProjectState = ProjectData;
export type ProjectSettingsAlias = ProjectSettings;
export type LegacyProjectInput = any;
export type ProjectPattern = PhraseData;
export type TrackerStepItem = StepData;
export type TrackerStep = StepData;