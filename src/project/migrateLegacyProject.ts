/**
 * SP-M8x Legacy Project Migrator
 * Upgrades older project structures to conform to the 32-step / 8-track / dual-FX contract.
 */

import { ProjectData, TrackData, PhraseData, StepData, PROJECT_SCHEMA_VERSION } from './projectTypes';
import { createInitialProject } from './initialProject';

export function migrateLegacyProject(rawInput: any): ProjectData {
  if (!rawInput || typeof rawInput !== 'object') {
    return createInitialProject();
  }

  // If already modern version
  if (rawInput.version && rawInput.tracks && rawInput.phrases) {
    return rawInput as ProjectData;
  }

  const base = createInitialProject();

  // Migrate BPM and swing if present
  if (rawInput.settings?.bpm || rawInput.bpm) {
    base.bpm = rawInput.settings?.bpm || rawInput.bpm;
  }
  if (rawInput.settings?.swing || rawInput.swing) {
    base.swing = rawInput.settings?.swing || rawInput.swing;
  }

  // Migrate legacy patterns/phrases into 32-step phrases
  if (rawInput.tracker?.patterns || rawInput.phrases) {
    const sourcePatterns = rawInput.tracker?.patterns || rawInput.phrases;
    const migratedPhrases: Record<string, PhraseData> = {};

    Object.entries(sourcePatterns).forEach(([id, pattern]: [string, any]) => {
      const rawSteps = pattern.steps || [];
      const steps: StepData[] = Array.from({ length: 32 }, (_, i) => {
        const existing = rawSteps[i];
        return {
          stepIndex: i,
          note: existing?.note || null,
          instrument: existing?.instrument || existing?.sampleId || null,
          volume: existing?.volume !== undefined ? existing?.volume : null,
          fx1: existing?.fx1 || (existing?.fx ? { opcode: existing.fx.opcode || '---', value: existing.fx.value || 0 } : { opcode: '---', value: 0 }),
          fx2: existing?.fx2 || { opcode: '---', value: 0 },
          sub: existing?.sub || existing?.subTickOffset || 0,
        };
      });

      migratedPhrases[id] = {
        id,
        name: pattern.name || `Phrase ${id}`,
        steps,
        tableLatches: pattern.tableLatches || [],
        tableRows: pattern.tableRows || [{ rowIndex: 0, command: '---', value: 0 }],
      };
    });

    if (Object.keys(migratedPhrases).length > 0) {
      base.phrases = migratedPhrases;
    }
  }

  return base;
}