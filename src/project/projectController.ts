/**
 * SP-M8x Hybrid Music Production Suite
 * projectController.ts — Single Source of Truth for Global State & Hybrid Persistence
 */

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface PadProjectData {
  id: string; // e.g. "A1"
  bank: BankId;
  name: string;
  isPolyphonic: boolean;
  fileName: string | null;
}

export interface TrackerStepItem {
  note: string;
  sampleId: string;
  fx?: string;
  subTickOffset?: number;
  velocity?: number;
  tableId?: number | null;
}

export interface TableStep {
  pitch: number | null;
  volume: number | null;
}

export interface TrackerTable {
  id: number;
  name: string;
  steps: TableStep[];
}

export interface Pattern {
  id: number;
  name: string;
  steps: TrackerStepItem[];
}

export interface ProjectSettings {
  bpm: number;
  masterVolume: number;
  activePatternIndex: number;
}

export interface ProjectState {
  settings: ProjectSettings;
  sampler: {
    pads: Record<string, PadProjectData>;
  };
  tracker: {
    patterns: Pattern[];
    tables?: TrackerTable[];
  };
}

export type ProjectStateListener = (state: ProjectState) => void;

const STORAGE_KEY = 'SP_M8X_PROJECT_STATE_V1';
const MIGRATION_BACKUP_KEY = 'SP_M8X_PROJECT_STATE_BEFORE_32_STEPS';
const PHRASE_LENGTH = 32;

function splitLongPhrases(state: ProjectState): boolean {
  const patterns = state.tracker.patterns;
  if (!patterns.some((pattern) => pattern.steps.length > PHRASE_LENGTH)) return false;
  let nextId = patterns.reduce((max, pattern) => Math.max(max, pattern.id), 0) + 1;
  const continuations: Pattern[] = [];
  for (const pattern of patterns) {
    if (pattern.steps.length <= PHRASE_LENGTH) continue;
    const originalSteps = pattern.steps;
    pattern.steps = originalSteps.slice(0, PHRASE_LENGTH);
    for (let start = PHRASE_LENGTH; start < originalSteps.length; start += PHRASE_LENGTH) {
      const steps = originalSteps.slice(start, start + PHRASE_LENGTH);
      while (steps.length < PHRASE_LENGTH) steps.push({ note: '---', sampleId: '--' });
      continuations.push({ id: nextId++, name: `${pattern.name} (part ${start / PHRASE_LENGTH + 1})`, steps });
    }
  }
  patterns.push(...continuations);
  return true;
}

class ProjectController {
  private state: ProjectState;
  private listeners: Set<ProjectStateListener> = new Set();
  private saveFailed = false;
  private migrationBackup: string | null = null;

  constructor() {
    const loaded = this.loadFromLocalStorage();
    this.state = loaded || this.getDefaultState();
    if (loaded && splitLongPhrases(this.state)) this.saveToLocalStorage();
    else this.migrationBackup = null;
  }

  private getDefaultState(): ProjectState {
    const initialPads: Record<string, PadProjectData> = {};
    const banks: BankId[] = ['A', 'B', 'C', 'D'];
    
    banks.forEach((bank) => {
      for (let i = 1; i <= 16; i++) {
        const padId = `${bank}${i}`;
        initialPads[padId] = {
          id: padId,
          bank,
          name: `EMPTY ${padId}`,
          isPolyphonic: true,
          fileName: null,
        };
      }
    });

    return {
      settings: {
        bpm: 120,
        masterVolume: 0.8,
        activePatternIndex: 0,
      },
      sampler: {
        pads: initialPads,
      },
      tracker: {
        patterns: [
          {
            id: 1,
            name: 'Pattern 01',
            steps: Array.from({ length: PHRASE_LENGTH }, () => ({
              note: '---',
              sampleId: '--',
            })),
          },
        ],
      },
    };
  }

  private loadFromLocalStorage(): ProjectState | null {
    try {
      if (typeof window === 'undefined') return null;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        console.log('[ProjectController] Loaded project state from localStorage.');
        this.migrationBackup = saved;
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('[ProjectController] Failed to load from localStorage:', e);
    }
    return null;
  }

  private saveToLocalStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      if (this.migrationBackup !== null) {
        localStorage.setItem(MIGRATION_BACKUP_KEY, this.migrationBackup);
        this.migrationBackup = null;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.saveFailed = false;
    } catch (e) {
      this.saveFailed = true;
      console.error('[ProjectController] Failed to save to localStorage:', e);
    }
  }

  public hasSaveError(): boolean {
    return this.saveFailed;
  }

  public getState(): ProjectState {
    return this.state;
  }

  public subscribe(listener: ProjectStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.saveToLocalStorage(); // Auto-save on every state change
    this.listeners.forEach((listener) => listener(this.state));
  }

  public setBpm(bpm: number): void {
    const clampedBpm = Math.max(40, Math.min(300, bpm));
    this.state.settings.bpm = clampedBpm;
    this.notify();
  }

  public setMasterVolume(volume: number): void {
    const clampedVol = Math.max(0, Math.min(1, volume));
    this.state.settings.masterVolume = clampedVol;
    this.notify();
  }

  public createPattern(): void {
    const patterns = this.state.tracker.patterns;
    const id = patterns.reduce((max, pattern) => Math.max(max, pattern.id), 0) + 1;
    patterns.push({
      id, name: `Pattern ${String(id).padStart(2, '0')}`,
      steps: Array.from({ length: PHRASE_LENGTH }, () => ({ note: '---', sampleId: '--' })),
    });
    this.state.settings.activePatternIndex = patterns.length - 1;
    this.notify();
  }

  public setActivePattern(index: number): void {
    if (!Number.isInteger(index) || !this.state.tracker.patterns[index]) return;
    this.state.settings.activePatternIndex = index;
    this.notify();
  }

  public updatePadMetadata(padId: string, metadata: Partial<PadProjectData>): void {
    if (!this.state.sampler.pads[padId]) return;
    this.state.sampler.pads[padId] = {
      ...this.state.sampler.pads[padId],
      ...metadata,
    };
    this.notify();
  }

  public updateStep(patternIndex: number, stepIndex: number, stepData: Partial<TrackerStepItem>): void {
    const pattern = this.state.tracker.patterns[patternIndex];
    if (!pattern || !pattern.steps[stepIndex]) return;

    pattern.steps[stepIndex] = {
      ...pattern.steps[stepIndex],
      ...stepData,
    };
    this.notify();
  }

  public clearStepNotes(patternIndex: number, stepIndices: readonly number[]): void {
    const pattern = this.state.tracker.patterns[patternIndex];
    if (!pattern) return;
    let changed = false;
    for (const index of new Set(stepIndices)) {
      const step = pattern.steps[index];
      if (!step || ((!step.note || step.note === '---') && (!step.sampleId || step.sampleId === '--'))) continue;
      pattern.steps[index] = { ...step, note: '---', sampleId: '--', subTickOffset: 0, velocity: undefined, tableId: null };
      changed = true;
    }
    if (changed) this.notify();
  }

  public getTables(): TrackerTable[] {
    return this.state.tracker.tables ?? [];
  }

  public createTable(): number {
    const tables = this.state.tracker.tables ?? (this.state.tracker.tables = []);
    const id = tables.reduce((max, table) => Math.max(max, table.id), 0) + 1;
    tables.push({
      id,
      name: `Table ${String(id).padStart(2, '0')}`,
      steps: Array.from({ length: 16 }, () => ({ pitch: null, volume: null })),
    });
    this.notify();
    return id;
  }

  public updateTableStep(tableId: number, stepIndex: number, changes: Partial<TableStep>): void {
    const step = this.getTables().find((table) => table.id === tableId)?.steps[stepIndex];
    if (!step) return;
    if (changes.pitch !== undefined && changes.pitch !== null &&
        (!Number.isInteger(changes.pitch) || changes.pitch < -24 || changes.pitch > 24)) throw new Error('Table pitch must be -24 to 24.');
    if (changes.volume !== undefined && changes.volume !== null &&
        (!Number.isInteger(changes.volume) || changes.volume < 0 || changes.volume > 127)) throw new Error('Table volume must be 0 to 127.');
    Object.assign(step, changes);
    this.notify();
  }

  public clearTableSteps(tableId: number, stepIndices: readonly number[]): void {
    const table = this.getTables().find((item) => item.id === tableId);
    if (!table) return;
    let changed = false;
    for (const index of new Set(stepIndices)) {
      const step = table.steps[index];
      if (!step || (step.pitch === null && step.volume === null)) continue;
      table.steps[index] = { pitch: null, volume: null };
      changed = true;
    }
    if (changed) this.notify();
  }

  /**
   * Export project state as a downloadable JSON file (.spm8x)
   */
  public exportProjectJson(): void {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sp-m8x-project-${Date.now()}.spm8x`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  /**
   * Import project state from a JSON string or parsed object
   */
  public importProjectJson(jsonData: ProjectState): void {
    if (!jsonData || !jsonData.settings || !jsonData.sampler || !jsonData.tracker) {
      console.error('[ProjectController] Invalid project file format.');
      return;
    }
    this.state = jsonData;
    splitLongPhrases(this.state);
    this.notify();
    console.log('[ProjectController] Project successfully imported and state updated.');
  }
}

export const projectController = new ProjectController();