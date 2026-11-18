import type { Pattern, ProjectState, TrackerTable } from './projectController';

/** Undoable slice of the project; samples, pads, and runtime audio state are excluded. */
export interface UndoableProjectData {
  settings: { bpm: number; activePatternIndex: number };
  tracker: { patterns: Pattern[]; tables?: TrackerTable[] };
}

function serialize(state: ProjectState): string {
  const data: UndoableProjectData = {
    settings: { bpm: state.settings.bpm, activePatternIndex: state.settings.activePatternIndex },
    tracker: { patterns: state.tracker.patterns, tables: state.tracker.tables },
  };
  return JSON.stringify(data);
}

/** Holds up to `maxStates` snapshots: the current state plus `maxStates - 1` undo steps. */
export class UndoRedoStack {
  private snapshots: string[] = [];
  private index = -1;

  constructor(private readonly maxStates = 16) {
    if (!Number.isSafeInteger(maxStates) || maxStates < 1) {
      throw new RangeError('maxStates must be a positive safe integer.');
    }
  }

  public seed(state: ProjectState): void {
    this.snapshots = [serialize(state)];
    this.index = 0;
  }

  /** Records the state after a completed edit; unchanged states are ignored. */
  public push(state: ProjectState): void {
    if (this.index < 0) throw new Error('Seed undo history before recording edits.');
    const snapshot = serialize(state);
    if (snapshot === this.snapshots[this.index]) return;
    this.snapshots.length = this.index + 1;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxStates) this.snapshots.shift();
    this.index = this.snapshots.length - 1;
  }

  /** The history pointer only moves if `apply` does not throw. */
  public undo(apply: (snapshot: UndoableProjectData) => void): boolean {
    if (!this.canUndo()) return false;
    apply(JSON.parse(this.snapshots[this.index - 1]) as UndoableProjectData);
    this.index--;
    return true;
  }

  public redo(apply: (snapshot: UndoableProjectData) => void): boolean {
    if (!this.canRedo()) return false;
    apply(JSON.parse(this.snapshots[this.index + 1]) as UndoableProjectData);
    this.index++;
    return true;
  }

  public canUndo(): boolean {
    return this.index > 0;
  }

  public canRedo(): boolean {
    return this.index >= 0 && this.index < this.snapshots.length - 1;
  }

  public clear(): void {
    this.snapshots = [];
    this.index = -1;
  }
}
