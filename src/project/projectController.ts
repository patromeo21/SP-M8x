/**
 * SP-M8x Hybrid Music Production Suite
 * projectController.ts — Single Source of Truth for Global State (Sampler, Tracker, Settings)
 */

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface PadProjectData {
  id: string; // e.g. "A1"
  bank: BankId;
  name: string;
  isPolyphonic: boolean;
  // AudioBuffer reference isn't serialized into project state JSON, but metadata is stored here
  fileName: string | null;
}

export interface TrackerStepItem {
  note: string;
  sampleId: string;
  fx?: string;
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

class ProjectController {
  private state: ProjectState;
  private listeners: Set<ProjectStateListener> = new Set();

  constructor() {
    // Initialize default project state including 64 pads across Banks A-D
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

    this.state = {
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

  public getState(): ProjectState {
    return this.state;
  }

  public subscribe(listener: ProjectStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
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
}

export const projectController = new ProjectController();