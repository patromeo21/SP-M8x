/**
 * Pure migration from the currently shipped in-memory app shape to SPProject.
 * This function does not mutate the supplied legacy objects and does not
 * register AudioBuffers with the Web Audio engine.
 */

import type { BankId } from '../types';
import {
  PROJECT_SCHEMA_VERSION,
  type LegacyProjectInput,
  type PadAssignment,
  type ProjectPattern,
  type SampleAsset,
  type SPProject,
} from './projectTypes';
import { createInitialProject, DEFAULT_EFFECTS } from './initialProject';

const BANKS: BankId[] = ['A', 'B', 'C', 'D'];

function stableAssetId(bank: BankId, slot: number): string {
  return `legacy-asset-${bank}-${String(slot + 1).padStart(2, '0')}`;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function migrateLegacyProject(input: LegacyProjectInput): SPProject {
  const now = input.now ?? new Date().toISOString();
  const project = createInitialProject(now, input.projectId ?? 'spm8x-migrated-project');

  project.schemaVersion = PROJECT_SCHEMA_VERSION;
  project.metadata.name = input.projectName ?? 'Migrated SP-M8x Project';
  project.settings.bpm = Math.max(40, Math.min(300, finiteOr(input.bpm ?? 125, 125)));
  project.settings.samplerMode = input.samplerMode ?? 'SAMPLE_TRIGGER';
  project.settings.theme = input.theme ?? 'default';

  const assets: SampleAsset[] = [];
  const migratedAssignments: PadAssignment[] = [];

  // Existing app has one 16-pad array. It maps to Bank A; B/C/D remain empty.
  for (const pad of input.pads) {
    const slot = Math.max(0, Math.min(15, Math.trunc(pad.id)));
    const assetId = pad.buffer ? stableAssetId('A', slot) : null;

    if (pad.buffer && assetId) {
      assets.push({
        id: assetId,
        name: pad.name || `Sample ${slot + 1}`,
        originalFilename: null,
        mimeType: null,
        durationSeconds: finiteOr(pad.buffer.duration, 0),
        sampleRate: finiteOr(pad.buffer.sampleRate, 0),
        channelCount: finiteOr(pad.buffer.numberOfChannels, 0),
        storageKey: null,
      });
    }

    migratedAssignments.push({
      id: `assignment-A-${String(slot + 1).padStart(2, '0')}`,
      bank: 'A',
      slot,
      name: pad.name || `Sample ${slot + 1}`,
      sampleAssetId: assetId,
      sliceId: null,
      sliceStartSeconds: Math.max(0, finiteOr(pad.sliceStart, 0)),
      sliceEndSeconds: pad.sliceEnd !== undefined ? Math.max(0, finiteOr(pad.sliceEnd, 0)) : null,
      volume: Math.max(0, Math.min(1, finiteOr(pad.volume, 0.8))),
      pan: Math.max(-1, Math.min(1, finiteOr(pad.pan, 0))),
      reverse: Boolean(pad.reverse),
      loop: Boolean(pad.loop),
      chromaticRootNote: finiteOr(pad.chromaticRootNote, 60),
      pitchOffset: finiteOr(pad.pitchOffset ?? 0, 0),
    });
  }

  // Replace only Bank A's initial empty assignments; retain all four banks.
  project.sampler.assignments = project.sampler.assignments.map((assignment) => {
    if (assignment.bank !== 'A') return assignment;
    return migratedAssignments.find((item) => item.slot === assignment.slot) ?? assignment;
  });
  project.sampler.assets = assets;

  if (input.pattern) {
    const legacyPattern = input.pattern;
    const migratedPattern: ProjectPattern = {
      id: `pattern-${String(legacyPattern.id).padStart(2, '0')}`,
      name: `PATTERN ${legacyPattern.id.toString(16).toUpperCase().padStart(2, '0')}`,
      length: Math.max(1, Math.min(64, Math.trunc(legacyPattern.length || legacyPattern.steps.length || 64))),
      steps: legacyPattern.steps.map((step, index) => ({
        id: `pattern-${legacyPattern.id}-step-${index}`,
        stepIndex: index,
        note: step.note ?? '---',
        velocity: Math.max(0, Math.min(127, finiteOr(step.volume, 0))),
        instrumentAssignmentId:
          step.note && step.note !== '---'
            ? `assignment-A-${String(Math.max(0, Math.min(15, Math.trunc(step.instrument))) + 1).padStart(2, '0')}`
            : null,
        phraseFx: step.command ?? '--',
        phraseFxValue: finiteOr(step.value, 0),
        tableVolume: null,
        tablePitch: null,
        tableFx: '--',
        tableFxValue: 0,
      })),
    };
    project.tracker.patterns = [migratedPattern];
  }

  project.effects = {
    punchIn: { ...DEFAULT_EFFECTS.punchIn, ...(input.punchInFX ?? {}) },
    master: { ...DEFAULT_EFFECTS.master, ...(input.masterFX ?? {}) },
  };
  project.settings.masterVolume = project.effects.master.masterVolume;
  project.metadata.updatedAt = now;

  const bankOrder: BankId[] = BANKS;
  if (bankOrder[0] !== 'A') {
    throw new Error('Legacy migration invariant failed: Bank A must be the first bank.');
  }

  return project;
}