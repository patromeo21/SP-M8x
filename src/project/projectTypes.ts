/**
 * SP-M8x Project Domain Model — A1.1
 *
 * Serializable project types. Runtime-only Web Audio objects (AudioBuffer,
 * AudioContext, AudioNode) must never be stored in this document.
 */

import type {
  BankId,
  MasterFXState,
  PunchInFXState,
  SamplerMode,
  ThemeMode,
  TrackerPattern,
} from '../types';

export const PROJECT_SCHEMA_VERSION = 1 as const;

export type SampleAssetId = string;
export type PadAssignmentId = string;
export type PatternId = string;

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettings {
  bpm: number;
  masterVolume: number;
  samplerMode: SamplerMode;
  theme: ThemeMode;
}

export interface SampleAsset {
  id: SampleAssetId;
  name: string;
  /** Original filename when imported, if known. */
  originalFilename: string | null;
  /** MIME type reported by the browser, if known. */
  mimeType: string | null;
  /** Duration in seconds once decoded. */
  durationSeconds: number | null;
  /** Sample rate in Hz once decoded. */
  sampleRate: number | null;
  /** Number of channels once decoded. */
  channelCount: number | null;
  /** Future IndexedDB key; binary data is deliberately not embedded here. */
  storageKey: string | null;
}

export interface SampleSlice {
  id: string;
  name: string;
  startSeconds: number;
  endSeconds: number | null;
}

export interface PadAssignment {
  /** Stable identity independent of bank position or pad number. */
  id: PadAssignmentId;
  bank: BankId;
  slot: number;
  name: string;
  sampleAssetId: SampleAssetId | null;
  sliceId: string | null;
  sliceStartSeconds: number;
  sliceEndSeconds: number | null;
  volume: number;
  pan: number;
  reverse: boolean;
  loop: boolean;
  chromaticRootNote: number;
  pitchOffset: number;
}

export interface SamplerProjectState {
  assets: SampleAsset[];
  slices: SampleSlice[];
  assignments: PadAssignment[];
}

export interface PhraseStep {
  /** Stable row identity within its pattern; stepIndex is the playback position. */
  id: string;
  stepIndex: number;
  note: string;
  velocity: number;
  instrumentAssignmentId: PadAssignmentId | null;
  phraseFx: string;
  phraseFxValue: number;
  tableVolume: number | null;
  tablePitch: number | null;
  tableFx: string;
  tableFxValue: number;
}

export interface ProjectPattern {
  id: PatternId;
  name: string;
  length: number;
  steps: PhraseStep[];
}

export interface TrackerProjectState {
  patterns: ProjectPattern[];
}

export interface SongCell {
  patternId: PatternId | null;
}

export interface SongTrack {
  id: string;
  name: string;
  rows: SongCell[];
}

export interface SongProjectState {
  rowCount: 32;
  tracks: SongTrack[];
}

export interface EffectsProjectState {
  punchIn: PunchInFXState;
  master: MasterFXState;
}

export interface SPProject {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  metadata: ProjectMetadata;
  settings: ProjectSettings;
  sampler: SamplerProjectState;
  tracker: TrackerProjectState;
  song: SongProjectState;
  effects: EffectsProjectState;
}

/** Legacy shape accepted only at the migration boundary. */
export interface LegacyProjectInput {
  pads: import('../types').Pad[];
  pattern?: TrackerPattern | null;
  bpm?: number;
  samplerMode?: SamplerMode;
  theme?: ThemeMode;
  punchInFX?: PunchInFXState;
  masterFX?: MasterFXState;
  projectName?: string;
  projectId?: string;
  now?: string;
}
