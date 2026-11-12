/**
 * SP-M8x Hybrid Music Production Suite
 * projectController.ts — Single Source of Truth for Global State & Hybrid Persistence
 */

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface PadProjectData {
  id: string;
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
  instrumentAssignmentId?: string | null;
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
  swing?: number;
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
const PHRASE_STEP_COUNT = 64;

class ProjectController {
  private state: ProjectState;
  private listeners: Set<ProjectStateListener> = new Set();

  constructor() {
    const savedState = this.loadFromLocalStorage();
    this.state = this.normalizePhraseLengths(savedState || this.getDefaultState());
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
        swing: 0,
      },
      sampler: {
        pads: initialPads,
      },
      tracker: {
        patterns: [
          {
            id: 1,
            name: 'Pattern 01',
            steps: Array.from({ length: PHRASE_STEP_COUNT }, (_, index) => ({
              note: index % 4 === 0 ? 'C-4' : '---',
              sampleId: index % 4 === 0 ? 'A1' : '--',
              subTickOffset: 0,
              velocity: 127,
              instrumentAssignmentId: index % 4 === 0 ? 'A1' : null,
            })),
          },
        ],
      },
    };
  }

  /** Normalize saved project data in memory while preserving existing step content. */
  private normalizePhraseLengths(state: ProjectState): ProjectState {
    if (!state?.tracker || !Array.isArray(state.tracker.patterns)) return this.getDefaultState();

    state.tracker.patterns.forEach((pattern) => {
      if (!Array.isArray(pattern.steps)) pattern.steps = [];
      if (pattern.steps.length < PHRASE_STEP_COUNT) {
        const existingSteps = pattern.steps;
        pattern.steps = Array.from({ length: PHRASE_STEP_COUNT }, (_, index) => existingSteps[index] ?? ({
          note: '---',
          sampleId: '--',
          subTickOffset: 0,
          velocity: 127,
          instrumentAssignmentId: null,
        }));
      } else if (pattern.steps.length > PHRASE_STEP_COUNT) {
        pattern.steps = pattern.steps.slice(0, PHRASE_STEP_COUNT);
      }
    });

    return state;
  }

  private loadFromLocalStorage(): ProjectState | null {
    try {
      if (typeof window === 'undefined') return null;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      return JSON.parse(saved) as ProjectState;
    } catch (error) {
      console.error('[ProjectController] Failed to load from localStorage:', error);
      return null;
    }
  }

  private saveToLocalStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('[ProjectController] Failed to save to localStorage:', error);
    }
  }

  public getState(): ProjectState {
    return this.state;
  }

  public subscribe(listener: ProjectStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.saveToLocalStorage();
    this.listeners.forEach((listener) => listener(this.state));
  }

  public setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    this.state.settings.bpm = Math.max(40, Math.min(300, bpm));
    this.notify();
  }

  public setMasterVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.state.settings.masterVolume = Math.max(0, Math.min(1, volume));
    this.notify();
  }

  public setSwing(swing: number): void {
    if (!Number.isFinite(swing)) return;
    this.state.settings.swing = Math.max(0, Math.min(1, swing));
    this.notify();
  }

  public updatePadMetadata(padId: string, metadata: Partial<PadProjectData>): void {
    const pad = this.state.sampler.pads[padId];
    if (!pad) return;
    this.state.sampler.pads[padId] = { ...pad, ...metadata };
    this.notify();
  }

  public updateStep(patternIndex: number, stepIndex: number, stepData: Partial<TrackerStepItem>): void {
    const pattern = this.state.tracker.patterns[patternIndex];
    if (!pattern || !pattern.steps[stepIndex]) return;

    pattern.steps[stepIndex] = {
      ...pattern.steps[stepIndex],
      ...stepData,
      subTickOffset: Math.max(0, Math.min(7, stepData.subTickOffset ?? pattern.steps[stepIndex].subTickOffset ?? 0)),
    };
    this.notify();
  }

  public exportProjectJson(): void {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `sp-m8x-project-${Date.now()}.spm8x`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  public importProjectJson(jsonData: ProjectState): void {
    if (!jsonData || !jsonData.settings || !jsonData.sampler || !jsonData.tracker) {
      console.error('[ProjectController] Invalid project file format.');
      return;
    }
    this.state = this.normalizePhraseLengths(jsonData);
    this.notify();
    console.log('[ProjectController] Project successfully imported and state updated.');
  }
}

export const projectController = new ProjectController();
export default projectController;
