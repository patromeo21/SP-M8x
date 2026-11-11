import type { BankId } from '../types';
import {
  PROJECT_SCHEMA_VERSION,
  type EffectsProjectState,
  type SPProject,
} from './projectTypes';

const BANKS: BankId[] = ['A', 'B', 'C', 'D'];

export const DEFAULT_EFFECTS: EffectsProjectState = {
  punchIn: {
    filterCutoff: 20000,
    filterResonance: 1.0,
    delayTime: 0.375,
    delayFeedback: 0.3,
    reverbMix: 0.2,
    bitcrushBits: 16,
    vinylNoise: 0.0,
    isolatorLow: 1.0,
    isolatorMid: 1.0,
    isolatorHigh: 1.0,
  },
  master: {
    limiterThreshold: -12,
    compressorRatio: 4,
    masterVolume: 0.8,
  },
};

export function createInitialProject(
  now: string = new Date().toISOString(),
  id: string = 'spm8x-project-1',
): SPProject {
  const assignments = BANKS.flatMap((bank) =>
    Array.from({ length: 16 }, (_, slot) => ({
      id: `assignment-${bank}-${String(slot + 1).padStart(2, '0')}`,
      bank,
      slot,
      name: `Sample ${slot + 1}`,
      sampleAssetId: null,
      sliceId: null,
      sliceStartSeconds: 0,
      sliceEndSeconds: null,
      volume: 0.8,
      pan: 0,
      reverse: false,
      loop: false,
      chromaticRootNote: 60,
      pitchOffset: 0,
    })),
  );

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: {
      id,
      name: 'Untitled SP-M8x Project',
      createdAt: now,
      updatedAt: now,
    },
    settings: {
      bpm: 125,
      masterVolume: 0.8,
      samplerMode: 'SAMPLE_TRIGGER',
      theme: 'default',
    },
    sampler: {
      assets: [],
      slices: [],
      assignments,
    },
    tracker: { patterns: [] },
    song: {
      rowCount: 32,
      tracks: Array.from({ length: 8 }, (_, trackIndex) => ({
        id: `song-track-${trackIndex + 1}`,
        name: `TRACK ${String(trackIndex + 1).padStart(2, '0')}`,
        rows: Array.from({ length: 32 }, () => ({ patternId: null })),
      })),
    },
    effects: {
      punchIn: { ...DEFAULT_EFFECTS.punchIn },
      master: { ...DEFAULT_EFFECTS.master },
    },
  };
}
