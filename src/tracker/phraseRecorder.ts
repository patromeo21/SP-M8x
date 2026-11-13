/**
 * SP-M8x Live Phrase Recorder
 * Captures live pad triggers and step data conforming to the 32-step PhraseData contract.
 */

import { PhraseData, StepData } from '../project/projectTypes';

export interface RecorderOptions {
  activeTrackIndex: number;
  quantize: boolean;
}

export function recordStepNote(
  phrase: PhraseData,
  stepIndex: number,
  note: string,
  instrumentId: string,
  volume: number = 100,
  subTick: number = 0
): PhraseData {
  if (!phrase || !phrase.steps) return phrase;

  const targetIndex = Math.max(0, Math.min(31, stepIndex));
  const updatedSteps = [...phrase.steps];

  updatedSteps[targetIndex] = {
    ...updatedSteps[targetIndex],
    stepIndex: targetIndex,
    note,
    instrument: instrumentId,
    volume,
    sub: subTick,
  };

  return {
    ...phrase,
    steps: updatedSteps,
  };
}