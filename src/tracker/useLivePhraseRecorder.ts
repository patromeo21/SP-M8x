/**
 * SP-M8x Hybrid Music Production Suite
 * useLivePhraseRecorder.ts — Live Step & Phrase Recording Hook
 */

import { useState, useEffect } from 'react';
import { projectController, ProjectState } from '../project/projectController';
import { padIdToInstrumentId } from '../sampler/padIds';

export function useLivePhraseRecorder() {
  const [projectState, setProjectState] = useState<ProjectState>(() => projectController.getState());

  useEffect(() => {
    const unsubscribe = projectController.subscribe((newState) => {
      setProjectState({ ...newState });
    });
    return () => unsubscribe();
  }, []);

  const recordStepNote = (patternIndex: number, stepIndex: number, note: string, sampleId: string) => {
    // Access sampler pads correctly from projectState.sampler.pads
    const pads = projectState.sampler.pads;
    if (!pads[sampleId]) {
      console.warn(`[useLivePhraseRecorder] Sample ID ${sampleId} not found in sampler banks.`);
    }

    // Update step via projectController method
    const instrumentId = padIdToInstrumentId(sampleId);
    if (instrumentId === null) throw new Error(`Invalid pad ID ${sampleId}.`);
    projectController.updateStep(patternIndex, stepIndex, {
      note,
      instrumentId,
    });
  };

  return {
    projectState,
    recordStepNote,
  };
}