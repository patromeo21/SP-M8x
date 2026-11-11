/**
 * SP-M8x Project Architecture
 * A1.2 — Centralized Project Actions
 */

import type {
  SPProject,
  ProjectSettings,
  SampleAsset,
  PadAssignment,
  ProjectPattern,
  EffectsProjectState,
} from './projectTypes';

export type ProjectAction =
  | { type: 'PROJECT_REPLACE'; project: SPProject }
  | { type: 'PROJECT_RENAME'; name: string }
  | { type: 'SETTINGS_UPDATE'; changes: Partial<ProjectSettings> }
  | { type: 'SAMPLE_ASSET_UPSERT'; asset: SampleAsset }
  | { type: 'PAD_ASSIGNMENT_UPSERT'; assignment: PadAssignment }
  | { type: 'PATTERN_UPSERT'; pattern: ProjectPattern }
  | { type: 'SONG_CELL_SET'; trackId: string; rowIndex: number; patternId: string | null }
  | { type: 'EFFECTS_REPLACE'; effects: EffectsProjectState }
  | { type: 'RESET_PROJECT' };

export const replaceProject = (project: SPProject): ProjectAction => ({
  type: 'PROJECT_REPLACE',
  project,
});

export const renameProject = (name: string): ProjectAction => ({
  type: 'PROJECT_RENAME',
  name,
});

export const updateSettings = (changes: Partial<ProjectSettings>): ProjectAction => ({
  type: 'SETTINGS_UPDATE',
  changes,
});

export const upsertSampleAsset = (asset: SampleAsset): ProjectAction => ({
  type: 'SAMPLE_ASSET_UPSERT',
  asset,
});

export const upsertPadAssignment = (assignment: PadAssignment): ProjectAction => ({
  type: 'PAD_ASSIGNMENT_UPSERT',
  assignment,
});

export const upsertPattern = (pattern: ProjectPattern): ProjectAction => ({
  type: 'PATTERN_UPSERT',
  pattern,
});

export const setSongCell = (trackId: string, rowIndex: number, patternId: string | null): ProjectAction => ({
  type: 'SONG_CELL_SET',
  trackId,
  rowIndex,
  patternId,
});

export const replaceEffects = (effects: EffectsProjectState): ProjectAction => ({
  type: 'EFFECTS_REPLACE',
  effects,
});

export const resetProject = (): ProjectAction => ({
  type: 'RESET_PROJECT',
});