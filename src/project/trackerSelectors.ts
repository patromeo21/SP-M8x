/**
 * SP-M8x Hybrid Music Production Suite
 * trackerSelectors.ts — Efficient Queries for Tracker Patterns & Micro-Timing
 */

import type { SPProject, ProjectPattern, TrackerStepItem } from './projectTypes';

/**
 * Retrieves all patterns from the project tracker state.
 */
export function selectPatterns(state: SPProject): ProjectPattern[] {
  return state.tracker.patterns;
}

/**
 * Retrieves a specific pattern by its unique ID.
 */
export function selectPatternById(state: SPProject, patternId: string): ProjectPattern | undefined {
  return state.tracker.patterns.find((p) => p.id === patternId);
}

/**
 * Retrieves a specific step item within a pattern by step index.
 */
export function selectStepByIndices(
  state: SPProject,
  patternId: string,
  stepIndex: number,
): TrackerStepItem | undefined {
  const pattern = selectPatternById(state, patternId);
  if (!pattern) return undefined;
  return pattern.steps.find((s) => s.stepIndex === stepIndex);
}

/**
 * Extracts all sub-tick micro-timing offsets across a pattern for groove analysis or rendering.
 */
export function selectMicroTimingOffsets(
  state: SPProject,
  patternId: string,
): Array<{ stepIndex: number; subTickOffset: number }> {
  const pattern = selectPatternById(state, patternId);
  if (!pattern) return [];

  return pattern.steps.map((step) => ({
    stepIndex: step.stepIndex,
    subTickOffset: step.subTickOffset,
  }));
}

/**
 * Filters and returns steps that have active notes, assigned instruments, or micro-timing groove offsets.
 */
export function selectActiveSteps(state: SPProject, patternId: string): TrackerStepItem[] {
  const pattern = selectPatternById(state, patternId);
  if (!pattern) return [];

  return pattern.steps.filter(
    (step) => step.note !== '---' || step.subTickOffset > 0 || step.instrumentAssignmentId !== null
  );
}
