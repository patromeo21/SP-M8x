/**
 * SP-M8x Project Data Types
 * Explicitly typed root interface supporting both modern 32-step/dual-FX structures
 * and all legacy nested properties for seamless compilation.
 */

export const PROJECT_SCHEMA_VERSION = '1.1.0';

export type StepNote = string | null;
export type InstrumentId = string | null;
export type VolumeValue = number | null;

export interface StepFxCommand {
  opcode: string;
  value: number;
}

export interface StepData {
  stepIndex: number;
  note: StepNote;
  instrument: InstrumentId;
  volume: VolumeValue;
  fx1: StepFxCommand;
  fx2: StepFxCommand;
  sub: number;
  id?: string;
  subTickOffset?: number;
  instrumentAssignmentId?: string;
}

export interface TableFxLatch {
  id: string;
  fxType: 'KILL' | 'RET' | 'CUT' | 'DEG' | 'SDL';
  targetTrack: number;
  engageStep: number;
  engageSub: number;
  releaseStep: number;
  releaseSub: number;
  parameterValues?: number[];
}

export interface TableRow {
  rowIndex: number;
  command: string;
  value: number;
}

export interface PhraseData {
  id: string;
  name: string;
  steps: StepData[];
  tableLatches: TableFxLatch[];
  tableRows: TableRow[];
  length?: number;
}

export interface TrackData {
  trackIndex: number;
  name: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  activePhraseId: string;
  rows?: { patternId: string | null }[];
}

export interface ProjectSettings {
  bpm: number;
  swing: number;
  masterVolume?: number;
  samplerMode?: string;
  theme?: string;
}

export interface SampleAsset {
  id: string;
  name: string;
  url?: string;
  buffer?: AudioBuffer;
  originalFilename?: string;
}

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface PadAssignment {
  padId: number;
  bank: BankId;
  sampleId: string | null;
  name: string;
  volume: number;
  pitch: number;
  id?: string;
  slot?: number;
  loop?: boolean;
  chromaticRootNote?: number;
  pitchOffset?: number;
  sampleAssetId?: string | null;
  sliceId?: string | null;
  sliceStartSeconds?: number;
  sliceEndSeconds?: number | null;
  pan?: number;
  reverse?: boolean;
}

export interface ProjectData {
  version: string;
  bpm: number;
  swing: number;
  tracks: TrackData[];
  phrases: Record<string, PhraseData>;
  instruments: Record<string, any>;

  // Explicit legacy sub-states required by reducers, migrators, and selectors
  schemaVersion?: string;
  metadata?: any;
  settings?: ProjectSettings;
  sampler?: {
    banks?: Record<BankId, PadAssignment[]>;
    pads?: PadAssignment[];
    [key: string]: any;
  };
  tracker?: {
    patterns?: Record<string, PhraseData> | PhraseData[];
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
}

// --- Backward Compatibility Aliases ---
export type SPProject = ProjectData;
export type EffectsProjectState = ProjectData;
export type ProjectSettingsAlias = ProjectSettings;
export type LegacyProjectInput = any;
export type ProjectPattern = PhraseData;
export type TrackerStepItem = StepData;
export type TrackerStep = StepData;