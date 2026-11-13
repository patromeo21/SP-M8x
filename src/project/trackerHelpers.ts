/**
 * SP-M8x Tracker Helpers
 * Utility functions for step and phrase manipulation.
 */

import { StepData, PhraseData } from './projectTypes';

export function createEmptyStep(stepIndex: number): StepData {
  return {
    stepIndex,
    note: null,
    instrument: null,
    volume: null,
    fx1: { opcode: '---', value: 0 },
    fx2: { opcode: '---', value: 0 },
    sub: 0,
  };
}

export function createEmptyPhrase(id: string, name: string = 'New Phrase'): PhraseData {
  const steps: StepData[] = Array.from({ length: 32 }, (_, i) => createEmptyStep(i));
  return {
    id,
    name,
    steps,
    tableLatches: [],
    tableRows: [{ rowIndex: 0, command: '---', value: 0 }],
  };
}