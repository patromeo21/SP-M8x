/**
 * SP-M8x Hybrid Music Production Suite
 * projectReducer.ts — Immutable State Reducer with Strict Boundary Validation
 */

import { Project } from './projectTypes';
import { ProjectAction } from './projectActions';
import { initialProject } from './initialProject';

export const projectReducer = (state: Project = initialProject, action: ProjectAction): Project => {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...action.payload };

    case 'UPDATE_SETTINGS': {
      const bpm = action.payload.bpm !== undefined 
        ? Math.max(40, Math.min(999, action.payload.bpm)) 
        : state.settings.bpm;
      const masterVolume = action.payload.masterVolume !== undefined 
        ? Math.max(0, Math.min(1, action.payload.masterVolume)) 
        : state.settings.masterVolume;

      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
          bpm,
          masterVolume,
        },
      };
    }

    case 'UPDATE_PAD': {
      const { bank, index, pad } = action.payload;
      if (!state.sampler.padBanks[bank]) return state;

      const updatedBankPads = [...state.sampler.padBanks[bank]];
      if (updatedBankPads[index]) {
        updatedBankPads[index] = { ...updatedBankPads[index], ...pad };
      }

      return {
        ...state,
        sampler: {
          ...state.sampler,
          padBanks: {
            ...state.sampler.padBanks,
            [bank]: updatedBankPads,
          },
        },
      };
    }

    case 'UPDATE_TRACKER_STEP': {
      const { patternIndex, stepIndex, step } = action.payload;
      const patterns = [...state.tracker.patterns];
      if (!patterns[patternIndex]) return state;

      const steps = [...patterns[patternIndex].steps];
      if (steps[stepIndex]) {
        steps[stepIndex] = { ...steps[stepIndex], ...step };
      }
      patterns[patternIndex] = { ...patterns[patternIndex], steps };

      return {
        ...state,
        tracker: {
          ...state.tracker,
          patterns,
        },
      };
    }

    case 'UPDATE_SONG_TRACK': {
      const { trackIndex, steps } = action.payload;
      const tracks = [...state.song.tracks];
      if (!tracks[trackIndex]) return state;

      tracks[trackIndex] = { ...tracks[trackIndex], steps };

      return {
        ...state,
        song: {
          ...state.song,
          tracks,
        },
      };
    }

    case 'UPDATE_TRANSPORT':
      return {
        ...state,
        transport: {
          ...state.transport,
          ...action.payload,
        },
      };

    case 'RESET_PROJECT':
      return { ...initialProject };

    default:
      return state;
  }
};