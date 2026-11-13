/**
 * SP-M8x Hybrid Music Production Suite
 * projectController.ts — Single source of truth for project data and persistence
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

export interface SongTrack {
  id: number;
  name: string;
  rows: Array<number | null>;
}

export interface ProjectSettings {
  bpm: number;
  masterVolume: number;
  activePatternIndex: number;
  swing?: number;
}

export interface ProjectState {
  settings: ProjectSettings;
  sampler: { pads: Record<string, PadProjectData> };
  tracker: { patterns: Pattern[] };
  song: { rowCount: number; tracks: SongTrack[] };
}

export type ProjectStateListener = (state: ProjectState) => void;

const STORAGE_KEY = 'SP_M8X_PROJECT_STATE_V1';
const PHRASE_STEP_COUNT = 64;
const SONG_ROW_COUNT = 32;
const SONG_TRACK_COUNT = 8;

const createEmptyStep = (): TrackerStepItem => ({
  note: '---', sampleId: '--', subTickOffset: 0, velocity: 127, instrumentAssignmentId: null,
});

class ProjectController {
  private state: ProjectState;
  private listeners = new Set<ProjectStateListener>();

  constructor() {
    this.state = this.normalizeProject(this.loadFromLocalStorage() ?? this.getDefaultState());
  }

  private createDefaultPads(): Record<string, PadProjectData> {
    const pads: Record<string, PadProjectData> = {};
    const banks: BankId[] = ['A', 'B', 'C', 'D'];
    banks.forEach((bank) => {
      for (let slot = 1; slot <= 16; slot += 1) {
        const id = `${bank}${slot}`;
        pads[id] = { id, bank, name: `EMPTY ${id}`, isPolyphonic: true, fileName: null };
      }
    });
    return pads;
  }

  private createDefaultSong(): ProjectState['song'] {
    return {
      rowCount: SONG_ROW_COUNT,
      tracks: Array.from({ length: SONG_TRACK_COUNT }, (_, index) => ({
        id: index + 1,
        name: `TRK ${index + 1}`,
        rows: Array.from({ length: SONG_ROW_COUNT }, () => null),
      })),
    };
  }

  private getDefaultState(): ProjectState {
    return {
      settings: { bpm: 120, masterVolume: 0.8, activePatternIndex: 0, swing: 0 },
      sampler: { pads: this.createDefaultPads() },
      tracker: {
        patterns: [{
          id: 1,
          name: 'Pattern 01',
          steps: Array.from({ length: PHRASE_STEP_COUNT }, (_, index) => ({
            ...createEmptyStep(),
            note: index % 4 === 0 ? 'C-4' : '---',
            sampleId: index % 4 === 0 ? 'A1' : '--',
            instrumentAssignmentId: index % 4 === 0 ? 'A1' : null,
          })),
        }],
      },
      song: this.createDefaultSong(),
    };
  }

  /** Add new schema fields to old saved projects without losing existing content. */
  private normalizeProject(input: ProjectState): ProjectState {
    const defaults = this.getDefaultState();
    const state = input && typeof input === 'object' ? input : defaults;
    state.settings = { ...defaults.settings, ...(state.settings ?? {}) };
    state.sampler = state.sampler && typeof state.sampler === 'object' ? state.sampler : defaults.sampler;
    state.sampler.pads = state.sampler.pads && typeof state.sampler.pads === 'object'
      ? { ...defaults.sampler.pads, ...state.sampler.pads }
      : defaults.sampler.pads;

    if (!state.tracker || !Array.isArray(state.tracker.patterns)) {
      state.tracker = defaults.tracker;
    }
    state.tracker.patterns = state.tracker.patterns.map((pattern) => {
      const existing = Array.isArray(pattern.steps) ? pattern.steps : [];
      return {
        ...pattern,
        steps: Array.from({ length: PHRASE_STEP_COUNT }, (_, index) => existing[index] ?? createEmptyStep()),
      };
    });

    const oldTracks = Array.isArray(state.song?.tracks) ? state.song.tracks : [];
    state.song = {
      rowCount: SONG_ROW_COUNT,
      tracks: Array.from({ length: SONG_TRACK_COUNT }, (_, index) => {
        const oldTrack = oldTracks[index];
        const rows = Array.isArray(oldTrack?.rows) ? oldTrack.rows : [];
        return {
          id: index + 1,
          name: oldTrack?.name || `TRK ${index + 1}`,
          rows: Array.from({ length: SONG_ROW_COUNT }, (_, row) => {
            const value = rows[row];
            return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99 ? value : null;
          }),
        };
      }),
    };
    return state;
  }

  private loadFromLocalStorage(): ProjectState | null {
    try {
      if (typeof window === 'undefined') return null;
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) as ProjectState : null;
    } catch (error) {
      console.error('[ProjectController] Failed to load from localStorage:', error);
      return null;
    }
  }

  private saveToLocalStorage(): void {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('[ProjectController] Failed to save to localStorage:', error);
    }
  }

  public getState(): ProjectState { return this.state; }

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

  public setSongCell(trackIndex: number, rowIndex: number, patternId: number | null): void {
    if (!Number.isInteger(trackIndex) || !Number.isInteger(rowIndex)) return;
    if (trackIndex < 0 || trackIndex >= SONG_TRACK_COUNT || rowIndex < 0 || rowIndex >= SONG_ROW_COUNT) return;
    if (patternId !== null && (!Number.isInteger(patternId) || patternId < 1 || patternId > 99)) return;
    this.state.song.tracks[trackIndex].rows[rowIndex] = patternId;
    this.notify();
  }

  public exportProjectJson(): void {
    const data = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(this.state, null, 2))}`;
    const anchor = document.createElement('a');
    anchor.href = data;
    anchor.download = `sp-m8x-project-${Date.now()}.spm8x`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  public importProjectJson(jsonData: ProjectState): void {
    if (!jsonData || !jsonData.settings || !jsonData.sampler || !jsonData.tracker) {
      console.error('[ProjectController] Invalid project file format.');
      return;
    }
    this.state = this.normalizeProject(jsonData);
    this.notify();
    console.log('[ProjectController] Project successfully imported and state updated.');
  }
}

export const projectController = new ProjectController();
export default projectController;
