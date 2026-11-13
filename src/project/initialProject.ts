/**
 * SP-M8x Initial Project Factory
 * Generates default project state conforming to the 32-step / 8-track / dual-FX contract.
 */

import { ProjectData, TrackData, PhraseData, StepData, PROJECT_SCHEMA_VERSION } from './projectTypes';

function createDefaultSteps(): StepData[] {
  const steps: StepData[] = [];
  for (let i = 0; i < 32; i++) {
    steps.push({
      stepIndex: i,
      note: null,
      instrument: null,
      volume: null,
      fx1: { opcode: '---', value: 0 },
      fx2: { opcode: '---', value: 0 },
      sub: 0,
    });
  }
  return steps;
}

export function createInitialProject(): ProjectData {
  const defaultPhraseId = 'phrase_01';
  
  const defaultPhrase: PhraseData = {
    id: defaultPhraseId,
    name: 'Init Phrase',
    steps: createDefaultSteps(),
    tableLatches: [],
    tableRows: [
      { rowIndex: 0, command: 'STA', value: 0 },
      { rowIndex: 1, command: '---', value: 0 },
    ],
  };

  const tracks: TrackData[] = Array.from({ length: 8 }, (_, index) => ({
    trackIndex: index,
    name: `Track ${index + 1}`,
    volume: 0.8,
    pan: 0.0,
    muted: false,
    soloed: false,
    activePhraseId: defaultPhraseId,
  }));

  return {
    version: PROJECT_SCHEMA_VERSION,
    bpm: 94,
    swing: 50,
    tracks,
    phrases: {
      [defaultPhraseId]: defaultPhrase,
    },
    instruments: {},
  };
}