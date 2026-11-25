/**
 * SP-M8x Hybrid Music Production Suite
 * useLivePhraseRecorder.ts — Live Step & Phrase Recording Hook
 */

import { useEffect, useState } from 'react';
import { projectController, type ProjectState } from '../project/projectController';
import { padIdToInstrumentId } from '../sampler/padIds';

function clampMicroOffset(offset: number | undefined): number {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return 0;
  return Math.max(-8, Math.min(8, Math.round(offset)));
}

export function useLivePhraseRecorder() {
  const [projectState, setProjectState] = useState<ProjectState>(() => projectController.getState());

  useEffect(() => {
    const unsubscribe = projectController.subscribe((newState) => {
      setProjectState({ ...newState });
    });
    return () => unsubscribe();
  }, []);

  const recordStepNote = (
    patternIndex: number,
    stepIndex: number,
    note: string,
    sampleId: string,
    subTickOffset = 0,
    trackIndex = projectController.getSelectedTrackIndex(),
  ): void => {
    const pattern = projectState.tracker.patterns[patternIndex];
    if (!pattern) {
      throw new Error(`Invalid pattern index ${patternIndex}.`);
    }
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= pattern.length) {
      throw new Error(`Invalid step index ${stepIndex}.`);
    }

    const pads = projectState.sampler.pads;
    if (!pads[sampleId]) {
      console.warn(`[useLivePhraseRecorder] Pad ID ${sampleId} not found in sampler banks.`);
    }

    const instrumentId = padIdToInstrumentId(sampleId);
    if (instrumentId === null) {
      throw new Error(`Invalid pad ID ${sampleId}.`);
    }

    const clampedOffset = clampMicroOffset(subTickOffset);
    projectController.updateStep(
      patternIndex,
      stepIndex,
      {
        note,
        instrumentId,
        subTickOffset: clampedOffset,
      },
      trackIndex,
    );
  };

  return {
    projectState,
    recordStepNote,
  };
}