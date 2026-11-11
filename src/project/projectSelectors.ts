/**
 * SP-M8x Hybrid Music Production Suite
 * projectSelectors.ts — Read-only Selectors for Project State Slices
 */

import { Project, ProjectSettings, SamplerState, TrackerState, SongState, TransportState, BankId, Pad, TrackerStep } from './projectTypes';

export const selectSettings = (state: Project): ProjectSettings => state.settings;
export const selectSampler = (state: Project): SamplerState => state.sampler;
export const selectTracker = (state: Project): TrackerState => state.tracker;
export const selectSong = (state: Project): SongState => state.song;
export const selectTransport = (state: Project): TransportState => state.transport;

export const selectPadByBankAndIndex = (state: Project, bank: BankId, index: number): Pad | undefined => {
  return state.sampler.padBanks[bank]?.[index];
};

export const selectTrackerStep = (state: Project, patternIndex: number, stepIndex: number): TrackerStep | undefined => {
  return state.tracker.patterns[patternIndex]?.steps[stepIndex];
};