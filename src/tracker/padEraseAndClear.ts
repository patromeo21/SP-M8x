/**
 * SP-M8x Hybrid Music Production Suite
 * tracker/padEraseAndClear.ts — SP-404mkII-style live Pad + Erase recording
 * and Track / Table / Pad clear helpers with ADSR reset signaling
 */

import { FxBus } from '../fx/fxEngine';

export type ClearScope = 'pad' | 'track' | 'table';

export interface SubtickEntry {
  subtickIndex: number;
  padId?: string | null;
  instrumentId?: string | null;
  value?: number;
}

export interface SequencerStepRecord {
  stepIndex: number;
  trackIndex?: number;
  padId?: string | null;
  instrumentId?: string | null;
  note?: string | null;
  fx1?: string | null;
  fx2?: string | null;
  fx3?: string | null;
  subticks?: SubtickEntry[];
}

export interface TableRowRecord {
  tableStep: number;
  padId?: string | null;
  subticks?: SubtickEntry[];
}

export interface AdsrEnvelopeDefaults {
  attackSec: number;
  decaySec: number;
  sustain: number;
  releaseSec: number;
}

export const DEFAULT_ADSR_ENVELOPE: Readonly<AdsrEnvelopeDefaults> = Object.freeze({
  attackSec: 0.005,
  decaySec: 0.15,
  sustain: 0.85,
  releaseSec: 0.2,
});

export interface LivePadEraseState {
  isEraseHeld: boolean;
  isRecording: boolean;
  activeBus: FxBus;
  targetPadId: string | null;
  erasedStepCount: number;
  erasedSubtickCount: number;
  adsrResetRequired: boolean;
}

export interface ClearOperationResult<T> {
  items: T;
  clearedCount: number;
  adsrResetRequired: boolean;
  adsrDefaults: AdsrEnvelopeDefaults;
}

export function createInitialLivePadEraseState(
  activeBus: FxBus = 'A',
): LivePadEraseState {
  return {
    isEraseHeld: false,
    isRecording: false,
    activeBus,
    targetPadId: null,
    erasedStepCount: 0,
    erasedSubtickCount: 0,
    adsrResetRequired: false,
  };
}

export function normalizePadId(padId: string | null | undefined): string | null {
  if (typeof padId !== 'string') return null;
  const trimmed = padId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Determines whether live Pad + Erase should mutate sequencer/subtick records.
 * Respects MST live-only guard when actively recording into sequence steps.
 */
export function canLiveErasePad(state: LivePadEraseState): boolean {
  const padId = normalizePadId(state.targetPadId);
  if (!state.isEraseHeld || !padId) return false;
  if (state.isRecording && state.activeBus === 'MST') return false;
  return true;
}

export function setEraseHold(
  state: LivePadEraseState,
  isEraseHeld: boolean,
  targetPadId?: string | null,
): LivePadEraseState {
  const nextPadId = targetPadId !== undefined ? normalizePadId(targetPadId) : state.targetPadId;
  return {
    ...state,
    isEraseHeld: Boolean(isEraseHeld),
    targetPadId: nextPadId,
    adsrResetRequired: false,
  };
}

export function setLiveEraseTargetPad(
  state: LivePadEraseState,
  targetPadId: string | null,
): LivePadEraseState {
  return {
    ...state,
    targetPadId: normalizePadId(targetPadId),
  };
}

export function syncLiveEraseTransport(
  state: LivePadEraseState,
  params: { isRecording?: boolean; activeBus?: FxBus },
): LivePadEraseState {
  return {
    ...state,
    isRecording: params.isRecording !== undefined ? Boolean(params.isRecording) : state.isRecording,
    activeBus: params.activeBus ?? state.activeBus,
  };
}

/**
 * Erases individual pad steps and matching subtick entries during live recording/playback
 * without altering unrelated pads or other tracks' data.
 */
export function erasePadAtStepAndSubtick(
  state: LivePadEraseState,
  steps: readonly SequencerStepRecord[],
  targetStepIndex: number,
  targetSubtickIndex?: number,
): { state: LivePadEraseState; steps: SequencerStepRecord[]; didErase: boolean } {
  const padId = normalizePadId(state.targetPadId);
  if (!canLiveErasePad(state) || !padId) {
    return { state, steps: steps.slice(), didErase: false };
  }

  let erasedSteps = 0;
  let erasedSubticks = 0;

  const nextSteps = steps.map((step) => {
    if (step.stepIndex !== targetStepIndex) return step;

    const existingSubticks = Array.isArray(step.subticks) ? step.subticks : [];
    const remainingSubticks = existingSubticks.filter((sub) => {
      const subPadMatches = normalizePadId(sub.padId) === padId;
      const subIndexMatches =
        targetSubtickIndex === undefined || sub.subtickIndex === targetSubtickIndex;
      if (subPadMatches && subIndexMatches) {
        erasedSubticks++;
        return false;
      }
      return true;
    });

    const stepPadMatches = normalizePadId(step.padId) === padId;
    if (stepPadMatches && targetSubtickIndex === undefined) {
      erasedSteps++;
      return {
        ...step,
        padId: null,
        instrumentId: null,
        subticks: remainingSubticks,
      };
    }

    if (remainingSubticks.length !== existingSubticks.length) {
      return {
        ...step,
        subticks: remainingSubticks,
      };
    }

    return step;
  });

  const didErase = erasedSteps > 0 || erasedSubticks > 0;
  return {
    didErase,
    steps: nextSteps,
    state: {
      ...state,
      erasedStepCount: state.erasedStepCount + erasedSteps,
      erasedSubtickCount: state.erasedSubtickCount + erasedSubticks,
    },
  };
}

/**
 * Clears all steps and subtick entries for a specific pad and signals ADSR reset to default.
 */
export function clearPadScope(
  steps: readonly SequencerStepRecord[],
  padId: string,
): ClearOperationResult<SequencerStepRecord[]> {
  const normalized = normalizePadId(padId);
  if (!normalized) {
    return {
      items: steps.slice(),
      clearedCount: 0,
      adsrResetRequired: false,
      adsrDefaults: { ...DEFAULT_ADSR_ENVELOPE },
    };
  }

  let clearedCount = 0;
  const nextSteps = steps.map((step) => {
    const stepMatches = normalizePadId(step.padId) === normalized;
    const subticks = Array.isArray(step.subticks) ? step.subticks : [];
    const filteredSubticks = subticks.filter((s) => {
      const match = normalizePadId(s.padId) === normalized;
      if (match) clearedCount++;
      return !match;
    });

    if (stepMatches) {
      clearedCount++;
      return {
        ...step,
        padId: null,
        instrumentId: null,
        subticks: filteredSubticks,
      };
    }

    if (filteredSubticks.length !== subticks.length) {
      return {
        ...step,
        subticks: filteredSubticks,
      };
    }

    return step;
  });

  return {
    items: nextSteps,
    clearedCount,
    adsrResetRequired: true,
    adsrDefaults: { ...DEFAULT_ADSR_ENVELOPE },
  };
}

/**
 * Clears step events for a specific track index without altering other tracks.
 */
export function clearTrackScope(
  steps: readonly SequencerStepRecord[],
  trackIndex: number,
): ClearOperationResult<SequencerStepRecord[]> {
  if (!Number.isFinite(trackIndex)) {
    return {
      items: steps.slice(),
      clearedCount: 0,
      adsrResetRequired: false,
      adsrDefaults: { ...DEFAULT_ADSR_ENVELOPE },
    };
  }

  const targetTrack = Math.trunc(trackIndex);
  let clearedCount = 0;

  const nextSteps = steps.map((step) => {
    if (step.trackIndex !== targetTrack) return step;
    clearedCount++;
    return {
      ...step,
      padId: null,
      instrumentId: null,
      note: null,
      fx1: null,
      fx2: null,
      fx3: null,
      subticks: [],
    };
  });

  return {
    items: nextSteps,
    clearedCount,
    adsrResetRequired: false,
    adsrDefaults: { ...DEFAULT_ADSR_ENVELOPE },
  };
}

/**
 * Clears all rows/subticks in a Table cleanly.
 */
export function clearTableScope(
  rows: readonly TableRowRecord[],
): ClearOperationResult<TableRowRecord[]> {
  let clearedCount = 0;
  const nextRows = rows.map((row) => {
    const subCount = Array.isArray(row.subticks) ? row.subticks.length : 0;
    if (row.padId || subCount > 0) {
      clearedCount += 1 + subCount;
    }
    return {
      ...row,
      padId: null,
      subticks: [],
    };
  });

  return {
    items: nextRows,
    clearedCount,
    adsrResetRequired: false,
    adsrDefaults: { ...DEFAULT_ADSR_ENVELOPE },
  };
}

/**
 * Signals ADSR reset back to default whenever a pad is cleared or a new sample is loaded.
 */
export function resolveAdsrOnPadEvent(
  eventType: 'pad-cleared' | 'sample-loaded' | 'manual-reset',
): { shouldReset: boolean; defaults: AdsrEnvelopeDefaults } {
  const shouldReset =
    eventType === 'pad-cleared' || eventType === 'sample-loaded' || eventType === 'manual-reset';
  return {
    shouldReset,
    defaults: { ...DEFAULT_ADSR_ENVELOPE },
  };
}