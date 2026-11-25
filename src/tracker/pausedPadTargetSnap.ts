/**
 * SP-M8x Hybrid Music Production Suite
 * tracker/pausedPadTargetSnap.ts — Paused transport Phrase-step snapping
 * to the last triggered INST step and locked/targeted pad resolution
 */

export interface TriggeredInstStep {
  stepIndex: number;
  padId?: string | null;
  instrumentId?: string | null;
  triggered?: boolean;
}

export interface PausedPadTargetState {
  snappedPhraseStep: number | null;
  lockedPadId: string | null;
  lockedInstrumentId: string | null;
  isPadLocked: boolean;
}

export function createInitialPausedPadTargetState(): PausedPadTargetState {
  return {
    snappedPhraseStep: null,
    lockedPadId: null,
    lockedInstrumentId: null,
    isPadLocked: false,
  };
}

/**
 * Finds the last step with an active/triggered INST event (padId or instrumentId).
 */
export function findLastTriggeredInstStep(
  steps: readonly TriggeredInstStep[],
  maxStepIndex?: number,
): TriggeredInstStep | null {
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const upperBound =
    typeof maxStepIndex === 'number' && Number.isFinite(maxStepIndex)
      ? Math.min(steps.length - 1, Math.max(0, Math.trunc(maxStepIndex)))
      : steps.length - 1;

  for (let i = upperBound; i >= 0; i--) {
    const step = steps[i];
    if (!step) continue;
    if (step.triggered === false) continue;

    const hasPad = typeof step.padId === 'string' && step.padId.trim().length > 0;
    const hasInstrument =
      typeof step.instrumentId === 'string' && step.instrumentId.trim().length > 0;

    if (hasPad || hasInstrument) {
      return step;
    }
  }

  return null;
}

/**
 * Resolves snapped Phrase step and locked/targeted pad when transport is paused.
 * Returns previous state unchanged while actively playing.
 */
export function resolvePausedPadTarget(
  prevState: PausedPadTargetState,
  params: {
    isPlaying: boolean;
    steps: readonly TriggeredInstStep[];
    fallbackPhraseStep?: number | null;
    maxStepIndex?: number;
  },
): PausedPadTargetState {
  if (params.isPlaying) {
    return prevState;
  }

  const lastTriggered = findLastTriggeredInstStep(params.steps, params.maxStepIndex);
  if (!lastTriggered) {
    return {
      snappedPhraseStep:
        typeof params.fallbackPhraseStep === 'number' && Number.isFinite(params.fallbackPhraseStep)
          ? Math.max(0, Math.trunc(params.fallbackPhraseStep))
          : prevState.snappedPhraseStep,
      lockedPadId: null,
      lockedInstrumentId: null,
      isPadLocked: false,
    };
  }

  const padId =
    typeof lastTriggered.padId === 'string' && lastTriggered.padId.trim().length > 0
      ? lastTriggered.padId
      : null;
  const instrumentId =
    typeof lastTriggered.instrumentId === 'string' && lastTriggered.instrumentId.trim().length > 0
      ? lastTriggered.instrumentId
      : null;

  return {
    snappedPhraseStep: Math.max(0, Math.trunc(lastTriggered.stepIndex)),
    lockedPadId: padId,
    lockedInstrumentId: instrumentId,
    isPadLocked: padId !== null || instrumentId !== null,
  };
}