/**
 * SP-M8x Project Architecture
 * A1.2 — Read-only Project Selectors
 */

import type {
  SPProject,
  ProjectSettings,
  SampleAsset,
  PadAssignment,
  ProjectPattern,
  EffectsProjectState,
} from './projectTypes';

export const selectSettings = (state: SPProject): ProjectSettings => state.settings;
export const selectSamplerAssets = (state: SPProject): SampleAsset[] => state.sampler.assets;
export const selectPadAssignments = (state: SPProject): PadAssignment[] => state.sampler.assignments;

export const selectPadByBankAndSlot = (
  state: SPProject,
  bank: 'A' | 'B' | 'C' | 'D',
  slot: number,
): PadAssignment | undefined => {
  return state.sampler.assignments.find((p) => p.bank === bank && p.slot === slot);
};

export const selectPatterns = (state: SPProject): ProjectPattern[] => state.tracker.patterns;

export const selectPatternById = (state: SPProject, patternId: string): ProjectPattern | undefined => {
  return state.tracker.patterns.find((p) => p.id === patternId);
};

export const selectSongTracks = (state: SPProject) => state.song.tracks;
export const selectEffects = (state: SPProject): EffectsProjectState => state.effects;