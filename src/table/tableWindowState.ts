/**
 * SP-M8x Hybrid Music Production Suite
 * table/tableWindowState.ts — 128-step Table windowing (16 rows/page),
 * single-instance subtick magnifier (2 before + 0..7 + 2 after),
 * and Phrase micro-step (-8..+8) latched Table row indicator helpers
 */

export const TABLE_TOTAL_STEPS = 128;
export const TABLE_PAGE_SIZE = 16;
export const TABLE_TOTAL_PAGES = Math.ceil(TABLE_TOTAL_STEPS / TABLE_PAGE_SIZE); // 8 pages (0..7)
export const MIN_MICRO_STEP_OFFSET = -8;
export const MAX_MICRO_STEP_OFFSET = 8;

/**
 * Fixed local subtick inspection window: 2 before + 0..7 + 2 after (12 offsets).
 */
export const SUBTICK_MAGNIFIER_OFFSETS = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type SubtickMagnifierOffset = (typeof SUBTICK_MAGNIFIER_OFFSETS)[number];

export interface ViewportRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PopoverSize {
  width: number;
  height: number;
}

export interface LatchedMicroOffsetIndicator {
  phraseStepIndex: number;
  microOffset: number; // Clamped to [-8, +8]
  latchedTableStep: number; // Clamped to [0, 127]
  latchedPageIndex: number; // Clamped to [0, 7]
}

export interface SubtickMagnifierState {
  isOpen: boolean;
  anchorTableStep: number | null;
  focalSubtick: number;
  visibleSubticks: number[];
  anchorRect: ViewportRect | null;
  popoverSize: PopoverSize;
  position: { top: number; left: number };
}

export interface TableWindowState {
  tableId: string | null;
  pageIndex: number; // 0..7
  followPlayhead: boolean;
  latchedStep: number | null; // 0..127
  latchedIndicator: LatchedMicroOffsetIndicator | null;
  magnifier: SubtickMagnifierState;
}

export function clampTableStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(TABLE_TOTAL_STEPS - 1, Math.trunc(step)));
}

export function clampTablePageIndex(pageIndex: number): number {
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.max(0, Math.min(TABLE_TOTAL_PAGES - 1, Math.trunc(pageIndex)));
}

export function clampMicroStepOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(MIN_MICRO_STEP_OFFSET, Math.min(MAX_MICRO_STEP_OFFSET, Math.trunc(offset)));
}

export function getPageStepRange(pageIndex: number): {
  pageIndex: number;
  startStep: number;
  endStep: number;
} {
  const safePage = clampTablePageIndex(pageIndex);
  const startStep = safePage * TABLE_PAGE_SIZE;
  const endStep = Math.min(TABLE_TOTAL_STEPS - 1, startStep + TABLE_PAGE_SIZE - 1);
  return { pageIndex: safePage, startStep, endStep };
}

export function getPageSlice<T>(items: readonly T[], pageIndex: number): T[] {
  const { startStep, endStep } = getPageStepRange(pageIndex);
  return items.slice(startStep, endStep + 1);
}

/**
 * Computes where a Phrase step + micro-step offset (-8..+8) lands on the 128-step Table
 * without mutating underlying audio clock/scheduling math.
 */
export function computeLatchedTableStep(
  phraseStepIndex: number,
  microOffset: number,
  stepsPerPhraseStep: number = 1,
): number {
  const safePhraseStep = Math.max(0, Number.isFinite(phraseStepIndex) ? Math.trunc(phraseStepIndex) : 0);
  const safeOffset = clampMicroStepOffset(microOffset);
  const safeScale = Math.max(1, Number.isFinite(stepsPerPhraseStep) ? Math.trunc(stepsPerPhraseStep) : 1);
  const baseTableStep = safePhraseStep * safeScale;
  return clampTableStep(baseTableStep + safeOffset);
}

/**
 * Builds the subtick window (2 before + 0..7 + 2 after) clamped within [0, 127].
 */
export function buildMagnifierSubticks(focalSubtick: number): number[] {
  const safeFocal = clampTableStep(focalSubtick);
  const result: number[] = [];
  for (const delta of SUBTICK_MAGNIFIER_OFFSETS) {
    const candidate = clampTableStep(safeFocal + delta);
    if (!result.includes(candidate)) {
      result.push(candidate);
    }
  }
  return result;
}

/**
 * Clamps popover coordinates inside viewport bounds with padding for iPad ergonomics.
 */
export function clampPopoverPosition(
  anchorRect: ViewportRect | null,
  popoverSize: PopoverSize,
  viewport: { width: number; height: number; padding?: number },
): { top: number; left: number } {
  const pad = Math.max(4, viewport.padding ?? 12);
  const maxLeft = Math.max(pad, viewport.width - popoverSize.width - pad);
  const maxTop = Math.max(pad, viewport.height - popoverSize.height - pad);

  if (!anchorRect) {
    return {
      left: Math.max(pad, Math.min(maxLeft, Math.round((viewport.width - popoverSize.width) / 2))),
      top: Math.max(pad, Math.min(maxTop, Math.round((viewport.height - popoverSize.height) / 2))),
    };
  }

  let left = Math.round(anchorRect.left + anchorRect.width + 8);
  if (left > maxLeft) {
    left = Math.round(anchorRect.left - popoverSize.width - 8);
  }

  let top = Math.round(anchorRect.top);
  if (top + popoverSize.height > viewport.height - pad) {
    top = Math.round(anchorRect.top + anchorRect.height - popoverSize.height);
  }

  return {
    left: Math.max(pad, Math.min(maxLeft, left)),
    top: Math.max(pad, Math.min(maxTop, top)),
  };
}

export function createClosedMagnifierState(
  popoverSize: PopoverSize = { width: 260, height: 340 },
): SubtickMagnifierState {
  return {
    isOpen: false,
    anchorTableStep: null,
    focalSubtick: 0,
    visibleSubticks: [],
    anchorRect: null,
    popoverSize,
    position: { top: 12, left: 12 },
  };
}

export function createInitialTableWindowState(tableId: string | null = null): TableWindowState {
  return {
    tableId,
    pageIndex: 0,
    followPlayhead: true,
    latchedStep: null,
    latchedIndicator: null,
    magnifier: createClosedMagnifierState(),
  };
}

export function closeMagnifier(state: TableWindowState): TableWindowState {
  return {
    ...state,
    magnifier: createClosedMagnifierState(state.magnifier.popoverSize),
  };
}

export function setTablePage(state: TableWindowState, nextPageIndex: number): TableWindowState {
  const clampedPage = clampTablePageIndex(nextPageIndex);
  const closed = closeMagnifier(state);
  return {
    ...closed,
    pageIndex: clampedPage,
    followPlayhead: false,
  };
}

export function syncPlayheadToTableWindow(
  state: TableWindowState,
  activeTick: number,
  isPlaying: boolean,
): TableWindowState {
  if (!isPlaying || !state.followPlayhead) return state;
  const safeTick = clampTableStep(activeTick);
  const targetPage = Math.floor(safeTick / TABLE_PAGE_SIZE);
  if (targetPage === state.pageIndex) return state;
  const closed = closeMagnifier(state);
  return {
    ...closed,
    pageIndex: targetPage,
  };
}

/**
 * Latches a Table row to a Phrase step + micro-step offset (-8..+8) and brings
 * the target 16-row page into view if needed, closing any stale magnifier.
 */
export function latchTableRowToMicroOffset(
  state: TableWindowState,
  phraseStepIndex: number,
  microOffset: number,
  stepsPerPhraseStep: number = 1,
): TableWindowState {
  const safeOffset = clampMicroStepOffset(microOffset);
  const latchedTableStep = computeLatchedTableStep(phraseStepIndex, safeOffset, stepsPerPhraseStep);
  const latchedPageIndex = Math.floor(latchedTableStep / TABLE_PAGE_SIZE);
  const closed = closeMagnifier(state);

  return {
    ...closed,
    pageIndex: latchedPageIndex,
    latchedStep: latchedTableStep,
    latchedIndicator: {
      phraseStepIndex: Math.max(0, Math.trunc(phraseStepIndex)),
      microOffset: safeOffset,
      latchedTableStep,
      latchedPageIndex,
    },
  };
}

export function openSubtickMagnifier(
  state: TableWindowState,
  anchorTableStep: number,
  focalSubtick: number,
  anchorRect: ViewportRect | null,
  viewport: { width: number; height: number; padding?: number },
  popoverSize?: PopoverSize,
): TableWindowState {
  const safeStep = clampTableStep(anchorTableStep);
  const safeFocal = clampTableStep(focalSubtick);
  const size = popoverSize ?? state.magnifier.popoverSize;
  const pageIndex = Math.floor(safeStep / TABLE_PAGE_SIZE);

  return {
    ...state,
    pageIndex,
    latchedStep: safeStep,
    magnifier: {
      isOpen: true,
      anchorTableStep: safeStep,
      focalSubtick: safeFocal,
      visibleSubticks: buildMagnifierSubticks(safeFocal),
      anchorRect,
      popoverSize: size,
      position: clampPopoverPosition(anchorRect, size, viewport),
    },
  };
}