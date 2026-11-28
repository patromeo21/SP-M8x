/**
 * SP-M8x Hybrid Music Production Suite
 * table/tableWindowState.ts — 128-step Table windowing (16 rows/page),
 * offset-aware 8-tick highlight window, per-tick scroll-stop latch,
 * and Phrase micro-step (-8..+8) latched Table row indicator helpers.
 * (Subtick magnifier retired per Section 4.)
 */

export const TABLE_TOTAL_STEPS = 128;
export const TABLE_PAGE_SIZE = 16;
export const TABLE_TOTAL_PAGES = Math.ceil(TABLE_TOTAL_STEPS / TABLE_PAGE_SIZE); // 8 pages (0..7)
export const FOCUSED_EIGHT_TICK_SPAN = 8;
export const MIN_MICRO_STEP_OFFSET = -8;
export const MAX_MICRO_STEP_OFFSET = 8;

export interface LatchedMicroOffsetIndicator {
  phraseStepIndex: number;
  microOffset: number; // Clamped to [-8, +8]
  latchedTableStep: number; // Clamped to [0, 127]
  latchedPageIndex: number; // Clamped to [0, 7]
}

export interface FocusedEightTickWindow {
  startTick: number; // 0..120
  endTick: number; // 7..127
}

export interface TableWindowState {
  tableId: string | null;
  pageIndex: number; // 0..7
  followPlayhead: boolean;
  anchorTableStep: number | null; // 0..127
  latchedStep: number | null; // 0..127
  focusedEightWindow: FocusedEightTickWindow | null;
  latchedIndicator: LatchedMicroOffsetIndicator | null;
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
  stepsPerPhraseStep: number = 8,
): number {
  const safePhraseStep = Math.max(0, Number.isFinite(phraseStepIndex) ? Math.trunc(phraseStepIndex) : 0);
  const safeOffset = clampMicroStepOffset(microOffset);
  const safeScale = Math.max(1, Number.isFinite(stepsPerPhraseStep) ? Math.trunc(stepsPerPhraseStep) : 8);
  const baseTableStep = safePhraseStep * safeScale;
  return clampTableStep(baseTableStep + safeOffset);
}

/**
 * Computes the highlighted 8-tick window that tracks `anchorTableStep` plus any
 * -8..+8 micro-step offset shift (safely guarded when anchorTableStep is null).
 */
export function computeFocusedEightTickWindow(
  anchorTableStep: number | null,
  microOffset: number = 0,
): FocusedEightTickWindow | null {
  if (anchorTableStep === null || !Number.isFinite(anchorTableStep)) {
    return null;
  }
  const safeAnchor = clampTableStep(anchorTableStep);
  const safeOffset = clampMicroStepOffset(microOffset);
  const shiftedTick = clampTableStep(safeAnchor + safeOffset);
  const startTick = Math.max(
    0,
    Math.min(TABLE_TOTAL_STEPS - FOCUSED_EIGHT_TICK_SPAN, shiftedTick),
  );
  const endTick = Math.min(TABLE_TOTAL_STEPS - 1, startTick + FOCUSED_EIGHT_TICK_SPAN - 1);
  return { startTick, endTick };
}

export function createInitialTableWindowState(tableId: string | null = null): TableWindowState {
  return {
    tableId,
    pageIndex: 0,
    followPlayhead: true,
    anchorTableStep: null,
    latchedStep: null,
    focusedEightWindow: null,
    latchedIndicator: null,
  };
}

export function setTablePage(state: TableWindowState, nextPageIndex: number): TableWindowState {
  const clampedPage = clampTablePageIndex(nextPageIndex);
  return {
    ...state,
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
  return {
    ...state,
    pageIndex: targetPage,
  };
}

/**
 * Latches a Table row/window to a Phrase step + micro-step offset (-8..+8),
 * updates the 8-tick highlight window to follow the offset, and brings the
 * target 16-row page into view unless `options.preservePage` is set.
 */
export function latchTableRowToMicroOffset(
  state: TableWindowState,
  phraseStepIndex: number,
  microOffset: number,
  stepsPerPhraseStep: number = 8,
  options: { preservePage?: boolean } = {},
): TableWindowState {
  const safePhraseStep = Math.max(0, Number.isFinite(phraseStepIndex) ? Math.trunc(phraseStepIndex) : 0);
  const safeOffset = clampMicroStepOffset(microOffset);
  const safeScale = Math.max(1, Number.isFinite(stepsPerPhraseStep) ? Math.trunc(stepsPerPhraseStep) : 8);
  const anchorTableStep = clampTableStep(safePhraseStep * safeScale);
  const focusedEightWindow = computeFocusedEightTickWindow(anchorTableStep, safeOffset);
  const latchedTableStep = focusedEightWindow
    ? focusedEightWindow.startTick
    : computeLatchedTableStep(safePhraseStep, safeOffset, safeScale);
  const latchedPageIndex = Math.floor(latchedTableStep / TABLE_PAGE_SIZE);

  return {
    ...state,
    pageIndex: options.preservePage ? state.pageIndex : latchedPageIndex,
    followPlayhead: false,
    anchorTableStep,
    latchedStep: latchedTableStep,
    focusedEightWindow,
    latchedIndicator: {
      phraseStepIndex: safePhraseStep,
      microOffset: safeOffset,
      latchedTableStep,
      latchedPageIndex,
    },
  };
}

/**
 * Snaps/latches to the nearest tick row when vertical scrolling stops across
 * the 128-tick table while keeping offset-aware 8-tick highlighting in sync.
 */
export function snapTableWindowToTick(
  state: TableWindowState,
  tick: number,
  options: { syncPage?: boolean } = {},
): TableWindowState {
  const safeTick = clampTableStep(tick);
  const currentOffset = state.latchedIndicator?.microOffset ?? 0;
  const focusedEightWindow = computeFocusedEightTickWindow(safeTick, currentOffset);
  const nextPage = options.syncPage ? Math.floor(safeTick / TABLE_PAGE_SIZE) : state.pageIndex;

  return {
    ...state,
    pageIndex: clampTablePageIndex(nextPage),
    followPlayhead: false,
    anchorTableStep: safeTick,
    latchedStep: safeTick,
    focusedEightWindow,
    latchedIndicator: state.latchedIndicator
      ? {
          ...state.latchedIndicator,
          latchedTableStep: safeTick,
          latchedPageIndex: clampTablePageIndex(nextPage),
        }
      : null,
  };
}