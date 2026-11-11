/**
 * SP-M8x Project Architecture
 * A1.2 — Immutable Project Reducer
 */

import type { SPProject } from './projectTypes';
import type { ProjectAction } from './projectActions';
import { createInitialProject } from './initialProject';

export const projectReducer = (
  state: SPProject = createInitialProject(),
  action: ProjectAction,
): SPProject => {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'PROJECT_REPLACE':
      return { ...action.project };

    case 'PROJECT_RENAME':
      return {
        ...state,
        metadata: {
          ...state.metadata,
          name: action.name,
          updatedAt: now,
        },
      };

    case 'SETTINGS_UPDATE': {
      const bpm = action.changes.bpm !== undefined
        ? Math.max(40, Math.min(300, action.changes.bpm))
        : state.settings.bpm;
      const masterVolume = action.changes.masterVolume !== undefined
        ? Math.max(0, Math.min(1, action.changes.masterVolume))
        : state.settings.masterVolume;

      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.changes,
          bpm,
          masterVolume,
        },
        metadata: { ...state.metadata, updatedAt: now },
      };
    }

    case 'SAMPLE_ASSET_UPSERT': {
      const asset = action.asset;
      const existingAssets = state.sampler.assets.filter((a) => a.id !== asset.id);
      return {
        ...state,
        sampler: {
          ...state.sampler,
          assets: [...existingAssets, asset],
        },
        metadata: { ...state.metadata, updatedAt: now },
      };
    }

    case 'PAD_ASSIGNMENT_UPSERT': {
      const assignment = action.assignment;
      const assignments = state.sampler.assignments.map((item) =>
        item.bank === assignment.bank && item.slot === assignment.slot ? assignment : item,
      );
      return {
        ...state,
        sampler: {
          ...state.sampler,
          assignments,
        },
        metadata: { ...state.metadata, updatedAt: now },
      };
    }

    case 'PATTERN_UPSERT': {
      const pattern = action.pattern;
      const patterns = state.tracker.patterns.map((p) => (p.id === pattern.id ? pattern : p));
      if (!patterns.some((p) => p.id === pattern.id)) {
        patterns.push(pattern);
      }
      return {
        ...state,
        tracker: {
          ...state.tracker,
          patterns,
        },
        metadata: { ...state.metadata, updatedAt: now },
      };
    }

    case 'SONG_CELL_SET': {
      const { trackId, rowIndex, patternId } = action;
      const tracks = state.song.tracks.map((track) => {
        if (track.id !== trackId) return track;
        const rows = [...track.rows];
        if (rows[rowIndex]) {
          rows[rowIndex] = { patternId };
        }
        return { ...track, rows };
      });
      return {
        ...state,
        song: {
          ...state.song,
          tracks,
        },
        metadata: { ...state.metadata, updatedAt: now },
      };
    }

    case 'EFFECTS_REPLACE':
      return {
        ...state,
        effects: { ...action.effects },
        settings: {
          ...state.settings,
          masterVolume: action.effects.master.masterVolume,
        },
        metadata: { ...state.metadata, updatedAt: now },
      };

    case 'RESET_PROJECT':
      return createInitialProject(now);

    default:
      return state;
  }
};