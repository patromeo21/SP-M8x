/**
 * SP-M8x Hybrid Music Production Suite
 * projectActions.ts — Action Types & Creators for Centralized Project State
 */

import { Project, ProjectSettings, Pad, TrackerStep, SongTrack, TransportState, BankId } from './projectTypes';

export type ProjectAction =
  | { type: 'SET_PROJECT'; payload: Project }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<ProjectSettings> }
  | { type: 'UPDATE_PAD'; payload: { bank: BankId; index: number; pad: Partial<Pad> } }
  | { type: 'UPDATE_TRACKER_STEP'; payload: { patternIndex: number; stepIndex: number; step: Partial<TrackerStep> } }
  | { type: 'UPDATE_SONG_TRACK'; payload: { trackIndex: number; steps: string[] } }
  | { type: 'UPDATE_TRANSPORT'; payload: Partial<TransportState> }
  | { type: 'RESET_PROJECT' };

export const setProject = (project: Project): ProjectAction => ({
  type: 'SET_PROJECT',
  payload: project,
});

export const updateSettings = (settings: Partial<ProjectSettings>): ProjectAction => ({
  type: 'UPDATE_SETTINGS',
  payload: settings,
});

export const updatePad = (bank: BankId, index: number, pad: Partial<Pad>): ProjectAction => ({
  type: 'UPDATE_PAD',
  payload: { bank, index, pad },
});

export const updateTrackerStep = (patternIndex: number, stepIndex: number, step: Partial<TrackerStep>): ProjectAction => ({
  type: 'UPDATE_TRACKER_STEP',
  payload: { patternIndex, stepIndex, step },
});

export const updateSongTrack = (trackIndex: number, steps: string[]): ProjectAction => ({
  type: 'UPDATE_SONG_TRACK',
  payload: { trackIndex, steps },
});

export const updateTransport = (transport: Partial<TransportState>): ProjectAction => ({
  type: 'UPDATE_TRANSPORT',
  payload: transport,
});

export const resetProject = (): ProjectAction => ({
  type: 'RESET_PROJECT',
});