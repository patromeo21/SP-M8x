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
  };
}

export type ProjectStateListener = (state: ProjectState) => void;

const STORAGE_KEY = 'SP_M8X_PROJECT_STATE_V1';

class ProjectController {
  private state: ProjectState;
  private listeners: Set<ProjectStateListener> = new Set();
  private saveFailed = false;

  constructor() {
    this.state = this.loadFromLocalStorage() || this.getDefaultState();
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
            steps: Array.from({ length: 64 }, () => ({
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
      pattern.steps[index] = { ...step, note: '---', sampleId: '--', subTickOffset: 0 };
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
    this.notify();
    console.log('[ProjectController] Project successfully imported and state updated.');
  }
}

export const projectController = new ProjectController();