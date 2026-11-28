/**
 * SP-M8x Hybrid Music Production Suite
 * tracker/pausedPadTargetSnap.ts — Paused transport Phrase-step snapping
 * to the last triggered INST step, subtick (0..7), micro-offset (-8..+8),
 * and locked/targeted pad resolution.
 */

export interface TriggeredInstStep {
  stepIndex: number;
  subTick?: number; // 0..7
  subTickOffset?: number; // -8..+8
  padId?: string | null;
  instrumentId?: string | null;
  triggered?: boolean;
}

export interface PausedPadTargetState {
  snappedPhraseStep: number | null;
  snappedSubTick: number | null; // 0..7
  snappedSubTickOffset: number; // -8..+8
  lockedPadId: string | null;
  lockedInstrumentId: string | null;
  isPadLocked: boolean;
}

export function clampSubTick(subTick: unknown): number {
  if (typeof subTick !== 'number' || !Number.isFinite(subTick)) return 0;
  return Math.max(0, Math.min(7, Math.trunc(subTick)));
}

export function clampMicroOffset(offset: unknown): number {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return 0;
  return Math.max(-8, Math.min(8, Math.trunc(offset)));
}

export function createInitialPausedPadTargetState(): PausedPadTargetState {
  return {
    snappedPhraseStep: null,
    snappedSubTick: null,
    snappedSubTickOffset: 0,
    lockedPadId: null,
    lockedInstrumentId: null,
    isPadLocked: false,
  };
}

/**
 * Clears transient pause-snap state when transport is stopped or reset.
 */
export function resetPausedPadTargetState(): PausedPadTargetState {
  return createInitialPausedPadTargetState();
}

function getEffectiveTriggerRank(step: TriggeredInstStep): number {
  const safeStep = Math.max(0, Math.trunc(step.stepIndex));
  const safeSubTick = clampSubTick(step.subTick);
  const safeOffset = clampMicroOffset(step.subTickOffset);
  return safeStep * 8 + safeSubTick + safeOffset / 8;
}

/**
 * Finds the last step with an active/triggered INST event (padId or instrumentId)
 * up to `maxStepIndex`, accounting for subtick (0..7) and -8..+8 micro-step offset.
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

  let best: TriggeredInstStep | null = null;
  let bestRank = -Infinity;

  for (let i = 0; i <= upperBound; i++) {
    const step = steps[i];
    if (!step) continue;
    if (step.triggered === false) continue;

    const hasPad = typeof step.padId === 'string' && step.padId.trim().length > 0;
    const hasInstrument =
      typeof step.instrumentId === 'string' && step.instrumentId.trim().length > 0;

    if (!hasPad && !hasInstrument) continue;

    const rank = getEffectiveTriggerRank(step);
    if (rank >= bestRank) {
      bestRank = rank;
      best = step;
    }
  }

  return best;
}

/**
 * Resolves snapped Phrase step, subtick (0..7), micro-offset (-8..+8), and
 * locked/targeted pad when transport is paused. Returns previous state unchanged
 * while actively playing.
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
      snappedSubTick: null,
      snappedSubTickOffset: 0,
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
    snappedSubTick: clampSubTick(lastTriggered.subTick),
    snappedSubTickOffset: clampMicroOffset(lastTriggered.subTickOffset),
    lockedPadId: padId,
    lockedInstrumentId: instrumentId,
    isPadLocked: padId !== null || instrumentId !== null,
  };
}