/**
 * SP-M8x Tracker Selectors
 * Provides safe queries for tracker grids and playback timing.
 */

import { ProjectData, PhraseData, StepData } from './projectTypes';

export function selectActivePhrase(state: ProjectData, trackIndex: number): PhraseData | undefined {
  const track = state?.tracks?.[trackIndex];
  if (!track || !track.activePhraseId) return undefined;
  return state.phrases?.[track.activePhraseId];
}

export function selectPhraseSteps(state: ProjectData, phraseId: string): StepData[] {
  const phrase = state?.phrases?.[phraseId];
  return phrase?.steps || Array.from({ length: 32 }, (_, i) => ({
    stepIndex: i,
    note: null,
    instrument: null,
    volume: null,
    fx1: { opcode: '---', value: 0 },
    fx2: { opcode: '---', value: 0 },
    sub: 0,
  }));
}

export function selectStepSubTiming(step: StepData): number {
  return step?.sub ?? step?.subTickOffset ?? 0;
}