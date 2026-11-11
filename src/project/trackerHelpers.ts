/**
 * SP-M8x Hybrid Music Production Suite
 * trackerHelpers.ts — Tracker Pattern & Table Data Model Utilities
 */

import type { TrackerStepItem, ProjectPattern } from './projectTypes';

/**
 * Creates a default empty tracker step with micro-timing support.
 */
export function createDefaultTrackerStep(stepIndex: number): TrackerStepItem {
  return {
    id: `step-${stepIndex}-${Math.random().toString(36).substring(2, 7)}`,
    stepIndex,
    subTickOffset: 0,
    note: '---',
    velocity: 100,
    instrumentAssignmentId: null,
    phraseFx: '--',
    phraseFxValue: 0,
    tableVolume: null,
    tablePitch: null,
    tableFx: '--',
    tableFxValue: 0,
  };
}

/**
 * Creates a new blank pattern with the specified length (default 32 steps).
 */
export function createEmptyPattern(id: string, name: string, length: number = 32): ProjectPattern {
  const steps = Array.from({ length }, (_, index) => createDefaultTrackerStep(index));
  return {
    id,
    name,
    length,
    steps,
  };
}

/**
 * Updates a specific step within a pattern immutably.
 */
export function updatePatternStep(
  pattern: ProjectPattern,
  stepIndex: number,
  changes: Partial<TrackerStepItem>,
): ProjectPattern {
  const updatedSteps = pattern.steps.map((step) => {
    if (step.stepIndex !== stepIndex) return step;
    return { ...step, ...changes };
  });

  return {
    ...pattern,
    steps: updatedSteps,
  };
}