/**
 * SP-M8x Project Reducer
 * Manages project state mutations with strict type safety and optional chaining.
 */

import { ProjectData, TrackData, PhraseData, StepData } from './projectTypes';
import { createInitialProject } from './initialProject';

export type ProjectAction =
  | { type: 'SET_BPM'; payload: number }
  | { type: 'SET_SWING'; payload: number }
  | { type: 'UPDATE_STEP'; payload: { phraseId: string; stepIndex: number; step: Partial<StepData> } }
  | { type: 'SET_TRACK_VOLUME'; payload: { trackIndex: number; volume: number } }
  | { type: 'SET_TRACK_PAN'; payload: { trackIndex: number; pan: number } }
  | { type: 'TOGGLE_MUTE'; payload: number }
  | { type: 'RESET_PROJECT' };

export function projectReducer(state: ProjectData = createInitialProject(), action: ProjectAction): ProjectData {
  switch (action.type) {
    case 'SET_BPM':
      return {
        ...state,
        bpm: action.payload,
        settings: {
          ...(state.settings || { bpm: 94, swing: 50 }),
          bpm: action.payload,
        },
      };

    case 'SET_SWING':
      return {
        ...state,
        swing: action.payload,
        settings: {
          ...(state.settings || { bpm: 94, swing: 50 }),
          swing: action.payload,
        },
      };

    case 'UPDATE_STEP': {
      const { phraseId, stepIndex, step } = action.payload;
      const phrase = state.phrases[phraseId];
      if (!phrase) return state;

      const updatedSteps = [...phrase.steps];
      if (updatedSteps[stepIndex]) {
        updatedSteps[stepIndex] = {
          ...updatedSteps[stepIndex],
          ...step,
        };
      }

      return {
        ...state,
        phrases: {
          ...state.phrases,
          [phraseId]: {
            ...phrase,
            steps: updatedSteps,
          },
        },
      };
    }

    case 'SET_TRACK_VOLUME': {
      const { trackIndex, volume } = action.payload;
      const tracks = state.tracks.map((t) =>
        t.trackIndex === trackIndex ? { ...t, volume } : t
      );
      return { ...state, tracks };
    }

    case 'SET_TRACK_PAN': {
      const { trackIndex, pan } = action.payload;
      const tracks = state.tracks.map((t) =>
        t.trackIndex === trackIndex ? { ...t, pan } : t
      );
      return { ...state, tracks };
    }

    case 'TOGGLE_MUTE': {
      const trackIndex = action.payload;
      const tracks = state.tracks.map((t) =>
        t.trackIndex === trackIndex ? { ...t, muted: !t.muted } : t
      );
      return { ...state, tracks };
    }

    case 'RESET_PROJECT':
      return createInitialProject();

    default:
      return state;
  }
}