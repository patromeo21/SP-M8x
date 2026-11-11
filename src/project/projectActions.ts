/**
 * SP-M8x Project Architecture
 * A1.2 — Centralized Project Actions
 *
 * Actions operate on the approved SPProject data model.
 */

import type {
  SPProject,
  ProjectSettings,
  SampleAsset,
  PadAssignment,
  ProjectPattern,
  EffectsProjectState,
} from './projectTypes';

/**
 * All supported project state operations.
 */
export type ProjectAction =
  | {
      type: 'PROJECT_REPLACE';
      project: SPProject;
    }
  | {
      type: 'PROJECT_RENAME';
      name: string;
    }
  | {
      type: 'SETTINGS_UPDATE';
      changes: Partial<ProjectSettings>;
    }
  | {
      type: 'SAMPLE_ASSET_UPSERT';
      asset: SampleAsset;
    }
  | {
      type: 'PAD_ASSIGNMENT_UPSERT';
      assignment: PadAssignment;
    }
  | {
      type: 'PATTERN_UPSERT';
      pattern: ProjectPattern;
    }
  | {
      type: 'SONG_CELL_SET';
      trackId: string;
      rowIndex: number;
      patternId: string | null;
    }
  | {
      type: 'EFFECTS_REPLACE';
      effects: EffectsProjectState;
    };
