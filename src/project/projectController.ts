/**
 * SP-M8x Hybrid Music Production Suite
 * projectController.ts — Single Source of Truth for Global State & Hybrid Persistence
 */

import { UndoRedoStack, type UndoableProjectData } from './undoStack';
import { validateStepEvent, type StepEvent } from './stepModel';
import { validateConditionalTrig, type ConditionalTrig } from '../tracker/stepTypes';
import { instrumentIdToPadId, padIdToInstrumentId } from '../sampler/padIds';
import {
  clearPadScope,
  clearTableScope,
  clearTrackScope,
  createInitialLivePadEraseState,
  erasePadAtStepAndSubtick,
  resolveAdsrOnPadEvent,
  setEraseHold,
  setLiveEraseTargetPad,
  syncLiveEraseTransport,
  type AdsrEnvelopeDefaults,
  type LivePadEraseState,
  type SequencerStepRecord,
  type TableRowRecord,
} from '../tracker/padEraseAndClear';
import { createDefaultAHDSRParams, normalizeAHDSR, type AHDSRParams } from '../audio/ahdsr';
import type { FxBus } from '../fx/fxEngine';

export type BankId = 'A' | 'B' | 'C' | 'D';

export type VoiceSlotFxCode = 'FL' | 'DL' | 'PS' | 'OFF';
export type PunchInSlotFxCode = 'PM' | 'LF' | 'BC' | 'OFF';
export type StepFxCode = VoiceSlotFxCode | PunchInSlotFxCode | '00' | string;

export interface PadProjectData {
  id: string; // e.g. "A1"
  bank: BankId;
  name: string;
  isPolyphonic: boolean;
  fileName: string | null;
  targetTrack: number;
  volume: number;
  chokeGroup: number | null;
  sliActive: boolean;
  adsr?: AHDSRParams;
}

export interface TrackerStepItem {
  note: string;
  instrumentId: number | null;
  /** FX1: Subtick/voice shaping slot (PS, FL, DL, OFF). */
  fx?: string;
  fxValue?: number;
  /** FX2: Secondary subtick/voice shaping slot (PS, FL, DL, OFF). */
  fx2?: VoiceSlotFxCode | '';
  fx2Value?: number;
  /** FX3: Grid-recordable punch-in slot (PM, LF, BC, OFF). */
  fx3?: PunchInSlotFxCode | '';
  fx3Value?: number;
  subTickOffset?: number;
  velocity?: number;
  tableId?: number | null;
  sliceIndex?: number;
  events?: StepEvent[];
  trig?: ConditionalTrig;
}

export interface TableStep {
  pitch: number | null;
  volume: number | null;
  reset?: boolean;
  /** FX1: Subtick/voice shaping slot (PS, FL, DL, OFF). */
  fx?: 'FL' | 'DL' | 'PS' | 'OFF';
  fxValue?: number;
  /** FX2: Secondary subtick/voice shaping slot (PS, FL, DL, OFF). */
  fx2?: 'FL' | 'DL' | 'PS' | 'OFF';
  fx2Value?: number;
  /** FX3: Grid-recordable punch-in slot (PM, LF, BC, OFF). */
  fx3?: PunchInSlotFxCode;
  fx3Value?: number;
  subTickOffset?: number;
}

export interface TrackerTable {
  id: number;
  name: string;
  trackIndex: number;
  steps: TableStep[];
}

export interface Pattern {
  id: number;
  name: string;
  length: PhraseLength;
  tracks: PhraseTrack[];
}

export type PhraseLength = 16 | 32 | 64;

export interface PhraseTrack {
  id: number;
  steps: TrackerStepItem[];
}

export interface ProjectSettings {
  bpm: number;
  masterVolume: number;
  activePatternIndex: number;
  trackVolumes?: number[];
}

export interface ControlAll {
  padVolumeOffset?: number;
  trackVolumeOffset?: number;
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
const MIGRATION_BACKUP_KEY = 'SP_M8X_PROJECT_STATE_BEFORE_8_TRACKS';
const PHRASE_LENGTH = 32;
const TRACK_COUNT = 8;
const TABLE_PAGE_TICKS = 128;
const TABLE_PAGES = 4;
const MAX_RECORDED_EVENTS_PER_STEP = 3;

const VOICE_SLOT_CODES = new Set<string>(['FL', 'DL', 'PS', 'OFF']);
const PUNCH_IN_SLOT_CODES = new Set<string>(['PM', 'LF', 'BC', 'OFF']);

function isPhraseLength(value: number): value is PhraseLength {
  return value === 16 || value === 32 || value === 64;
}

function emptyStep(): TrackerStepItem {
  return { note: '---', instrumentId: null };
}

function createTracks(): PhraseTrack[] {
  return Array.from({ length: TRACK_COUNT }, (_, id) => ({
    id,
    steps: Array.from({ length: PHRASE_LENGTH }, emptyStep),
  }));
}

function validTrack(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < TRACK_COUNT;
}

function validateVolume(volume: number): void {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new Error('Track volume must be between 0 and 1.');
  }
}

function sanitizeFxSlotValue(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid FX parameter value.');
  }
  return Math.max(0, Math.min(127, Math.round(value)));
}

function sanitizeVoiceSlotCode(code: unknown): VoiceSlotFxCode | '' | undefined {
  if (code === undefined) return undefined;
  if (typeof code !== 'string') throw new Error('Invalid FX1/FX2 opcode.');
  if (code === '' || code === '00') return '';
  if (code === 'DR') return 'OFF';
  if (!VOICE_SLOT_CODES.has(code)) throw new Error(`Invalid FX1/FX2 opcode: ${code}`);
  return code as VoiceSlotFxCode;
}

function sanitizePunchInSlotCode(code: unknown): PunchInSlotFxCode | '' | undefined {
  if (code === undefined) return undefined;
  if (typeof code !== 'string') throw new Error('Invalid FX3 punch-in opcode.');
  if (code === '' || code === '00') return '';
  if (!PUNCH_IN_SLOT_CODES.has(code)) throw new Error(`Invalid FX3 punch-in opcode: ${code}`);
  return code as PunchInSlotFxCode;
}

function migrateStep(value: unknown): TrackerStepItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid phrase step.');
  const step = value as Record<string, unknown>;
  if (typeof step.note !== 'string') throw new Error('Invalid phrase note.');
  if (
    step.sliceIndex !== undefined &&
    (!Number.isInteger(step.sliceIndex) || (step.sliceIndex as number) < 1 || (step.sliceIndex as number) > 32)
  ) {
    throw new Error('Invalid slice index.');
  }
  let instrumentId = step.instrumentId;
  if ('sampleId' in step) {
    if (typeof step.sampleId !== 'string') throw new Error('Invalid legacy sample ID.');
    const match = /^([A-D])([1-9]|1[0-6])$/.exec(step.sampleId);
    const converted =
      step.sampleId === '--' || step.sampleId === ''
        ? null
        : match
          ? (match[1].charCodeAt(0) - 65) * 16 + Number(match[2]) - 1
          : undefined;
    if (converted === undefined || (instrumentId !== undefined && instrumentId !== converted)) {
      throw new Error('Invalid or conflicting legacy sample ID.');
    }
    instrumentId = converted;
  }
  if (
    instrumentId !== null &&
    (typeof instrumentId !== 'number' || !Number.isInteger(instrumentId) || instrumentId < 0 || instrumentId > 63)
  ) {
    throw new Error('Invalid instrument ID.');
  }
  if (step.events !== undefined) {
    if (!Array.isArray(step.events)) throw new Error('Invalid polyphonic step events.');
    step.events.forEach((event) => validateStepEvent(event as StepEvent));
  }
  if (step.trig !== undefined && !validateConditionalTrig(step.trig)) {
    throw new Error('Invalid phrase step condition.');
  }
  const fx1 = typeof step.fx === 'string' && step.fx === 'DR' ? 'OFF' : step.fx;
  const fx1Value = sanitizeFxSlotValue(step.fxValue);
  const fx2 = sanitizeVoiceSlotCode(step.fx2);
  const fx2Value = sanitizeFxSlotValue(step.fx2Value);
  const fx3 = sanitizePunchInSlotCode(step.fx3);
  const fx3Value = sanitizeFxSlotValue(step.fx3Value);
  const { sampleId: _sampleId, ...rest } = step;
  return {
    ...rest,
    note: step.note,
    instrumentId: instrumentId as number | null,
    ...(fx1 !== undefined ? { fx: fx1 as string } : {}),
    ...(fx1Value !== undefined ? { fxValue: fx1Value } : {}),
    ...(fx2 !== undefined ? { fx2 } : {}),
    ...(fx2Value !== undefined ? { fx2Value } : {}),
    ...(fx3 !== undefined ? { fx3 } : {}),
    ...(fx3Value !== undefined ? { fx3Value } : {}),
  };
}

function migrateProject(state: ProjectState): boolean {
  if (
    !state ||
    typeof state !== 'object' ||
    !state.settings ||
    !state.sampler ||
    !state.sampler.pads ||
    typeof state.sampler.pads !== 'object' ||
    Array.isArray(state.sampler.pads) ||
    !state.tracker ||
    !Array.isArray(state.tracker.patterns)
  ) {
    throw new Error('Invalid project state.');
  }
  let changed = false;
  if (state.settings.trackVolumes === undefined) {
    state.settings.trackVolumes = Array(TRACK_COUNT).fill(1);
    changed = true;
  } else {
    if (!Array.isArray(state.settings.trackVolumes) || state.settings.trackVolumes.length !== TRACK_COUNT) {
      throw new Error('Invalid track volumes.');
    }
    state.settings.trackVolumes.forEach(validateVolume);
  }
  for (const bank of ['A', 'B', 'C', 'D'] as BankId[]) {
    for (let i = 1; i <= 16; i++) {
      const id = `${bank}${i}`;
      const pad = state.sampler.pads[id];
      if (pad === undefined) {
        state.sampler.pads[id] = {
          id,
          bank,
          name: `EMPTY ${id}`,
          isPolyphonic: true,
          fileName: null,
          targetTrack: 0,
          volume: 1,
          chokeGroup: null,
          sliActive: false,
          adsr: createDefaultAHDSRParams(),
        };
        changed = true;
      } else {
        if (!pad || typeof pad !== 'object' || Array.isArray(pad)) throw new Error(`Invalid pad ${id}.`);
        if (pad.isPolyphonic === undefined) {
          pad.isPolyphonic = true;
          changed = true;
        } else if (typeof pad.isPolyphonic !== 'boolean') {
          throw new Error(`Invalid polyphonic state for ${id}.`);
        }
        if (pad.sliActive === undefined) {
          pad.sliActive = false;
          changed = true;
        } else if (typeof pad.sliActive !== 'boolean') {
          throw new Error(`Invalid SLI state for ${id}.`);
        }
        if (pad.targetTrack === undefined) {
          pad.targetTrack = 0;
          changed = true;
        } else if (!validTrack(pad.targetTrack)) {
          throw new Error(`Invalid target track for ${id}.`);
        }
        if (pad.volume === undefined) {
          pad.volume = 1;
          changed = true;
        } else {
          validateVolume(pad.volume);
        }
        if (pad.chokeGroup === undefined) {
          pad.chokeGroup = null;
          changed = true;
        } else if (
          pad.chokeGroup !== null &&
          (!Number.isInteger(pad.chokeGroup) || pad.chokeGroup < 1 || pad.chokeGroup > 8)
        ) {
          throw new Error(`Invalid choke group for ${id}.`);
        }
        if (pad.adsr === undefined) {
          pad.adsr = createDefaultAHDSRParams();
          changed = true;
        } else {
          pad.adsr = normalizeAHDSR(pad.adsr);
        }
      }
    }
  }
  const patterns = state.tracker.patterns;
  if (!Number.isInteger(state.settings.activePatternIndex) || !patterns[state.settings.activePatternIndex]) {
    throw new Error('Invalid active pattern index.');
  }
  let nextId =
    patterns.reduce((max, pattern) => {
      if (
        !pattern ||
        typeof pattern !== 'object' ||
        !Number.isInteger(pattern.id) ||
        typeof pattern.name !== 'string'
      ) {
        throw new Error('Invalid pattern.');
      }
      return Math.max(max, pattern.id);
    }, 0) + 1;
  const continuations: Pattern[] = [];
  for (const pattern of patterns) {
    const legacy = pattern as Pattern & { steps?: unknown };
    if (legacy.steps !== undefined) {
      if (legacy.tracks !== undefined || !Array.isArray(legacy.steps) || legacy.steps.length === 0) {
        throw new Error('Invalid legacy phrase.');
      }
      const steps = legacy.steps.map(migrateStep);
      const chunks = Math.ceil(steps.length / PHRASE_LENGTH);
      for (let chunk = 0; chunk < chunks; chunk++) {
        const tracks = createTracks();
        const part = steps.slice(chunk * PHRASE_LENGTH, (chunk + 1) * PHRASE_LENGTH);
        part.forEach((step, index) => {
          tracks[0].steps[index] = step;
        });
        if (chunk === 0) {
          pattern.tracks = tracks;
          delete legacy.steps;
        } else {
          continuations.push({
            id: nextId++,
            name: `${pattern.name} (part ${chunk + 1})`,
            length: PHRASE_LENGTH,
            tracks,
          });
        }
      }
      pattern.length = PHRASE_LENGTH;
      changed = true;
    } else {
      if (!Array.isArray(pattern.tracks) || pattern.tracks.length !== TRACK_COUNT) {
        throw new Error('Invalid phrase tracks.');
      }
      if (pattern.length === undefined) {
        pattern.length = PHRASE_LENGTH;
        changed = true;
      }
      if (!isPhraseLength(pattern.length)) throw new Error('Invalid phrase length.');
      const storedLength = pattern.tracks[0]?.steps?.length;
      if (!isPhraseLength(storedLength) || storedLength < pattern.length) {
        throw new Error('Invalid phrase track length.');
      }
      pattern.tracks.forEach((track, index) => {
        if (!track || track.id !== index || !Array.isArray(track.steps) || track.steps.length !== storedLength) {
          throw new Error('Invalid phrase track.');
        }
        track.steps.forEach((step, stepIdx) => {
          if ('sampleId' in (step ?? {})) throw new Error('Legacy sample ID in phrase track.');
          track.steps[stepIdx] = migrateStep(step);
        });
      });
    }
  }
  patterns.push(...continuations);
  return normalizeTablePages(state) || changed;
}

function normalizeTablePages(state: ProjectState): boolean {
  const tables = state.tracker.tables ?? [];
  if (!Array.isArray(tables)) throw new Error('Invalid tables.');
  let changed = false;
  for (const table of tables) {
    if (
      !table ||
      !Array.isArray(table.steps) ||
      table.steps.length > TABLE_PAGE_TICKS * TABLE_PAGES ||
      table.steps.some((step) => !step || typeof step !== 'object' || Array.isArray(step))
    ) {
      throw new Error('Invalid table steps.');
    }
    if (table.trackIndex === undefined) {
      table.trackIndex = 0;
      changed = true;
    } else if (!validTrack(table.trackIndex)) {
      throw new Error('Invalid table track index.');
    }
    if (table.steps.length === TABLE_PAGE_TICKS * TABLE_PAGES) {
      for (const step of table.steps) {
        if ((step.fx as string | undefined) === 'DR') {
          step.fx = 'OFF';
          changed = true;
        }
        if ((step.fx2 as string | undefined) === 'DR') {
          step.fx2 = 'OFF';
          changed = true;
        }
      }
      continue;
    }
    const previous = table.steps;
    const steps = Array.from({ length: TABLE_PAGE_TICKS * TABLE_PAGES }, (): TableStep => ({
      pitch: null,
      volume: null,
    }));
    if (previous.length === 16) {
      for (const page of [0, 1]) {
        for (let index = 0; index < previous.length; index++) {
          steps[page * TABLE_PAGE_TICKS + index] = { ...previous[index] };
        }
      }
    } else {
      for (let index = 0; index < Math.min(previous.length, steps.length); index++) {
        steps[index] = { ...previous[index] };
      }
    }
    table.steps = steps;
    changed = true;
  }
  let nextTableId = tables.reduce((max, table) => Math.max(max, table.id), 0) + 1;
  for (const table of [...tables]) {
    for (let trackIndex = 0; trackIndex < TRACK_COUNT; trackIndex++) {
      if (trackIndex === table.trackIndex) continue;
      const hasReference = state.tracker.patterns.some((pattern) =>
        pattern.tracks[trackIndex].steps.some((step) => step.tableId === table.id),
      );
      if (!hasReference) continue;
      const tableId = nextTableId++;
      tables.push({
        ...table,
        id: tableId,
        trackIndex,
        steps: table.steps.map((step) => ({ ...step })),
      });
      for (const pattern of state.tracker.patterns) {
        const track = pattern.tracks[trackIndex];
        for (const step of track.steps) {
          if (step.tableId === table.id) step.tableId = tableId;
        }
      }
      changed = true;
    }
  }
  return changed;
}

class ProjectController {
  private state: ProjectState;
  private listeners: Set<ProjectStateListener> = new Set();
  private saveFailed = false;
  private readOnly = false;
  private migrationBackup: string | null = null;
  private undoStack = new UndoRedoStack(16);
  private selectedTrackIndex = 0;
  private liveEraseState: LivePadEraseState = createInitialLivePadEraseState('A');

  constructor() {
    this.state = this.getDefaultState();
    try {
      if (typeof window === 'undefined') return;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return;
      const loaded = JSON.parse(saved) as ProjectState;
      const migrated = migrateProject(loaded);
      this.state = loaded;
      if (migrated) {
        this.migrationBackup = saved;
        this.saveToLocalStorage();
      }
      console.log('[ProjectController] Loaded project state from localStorage.');
    } catch (e) {
      this.readOnly = true;
      this.saveFailed = true;
      this.freezeState(this.state);
      console.error('[ProjectController] Failed to load project; using read-only defaults:', e);
    } finally {
      this.undoStack.seed(this.state);
    }
  }

  private freezeState(value: object): void {
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') this.freezeState(child);
    }
    Object.freeze(value);
  }

  private assertWritable(): void {
    if (this.readOnly) throw new Error('Project is read-only after a load failure.');
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
          targetTrack: 0,
          volume: 1,
          chokeGroup: null,
          sliActive: false,
          adsr: createDefaultAHDSRParams(),
        };
      }
    });

    return {
      settings: {
        bpm: 120,
        masterVolume: 0.8,
        activePatternIndex: 0,
        trackVolumes: Array(TRACK_COUNT).fill(1),
      },
      sampler: {
        pads: initialPads,
      },
      tracker: {
        patterns: [
          {
            id: 1,
            name: 'Pattern 01',
            length: PHRASE_LENGTH,
            tracks: createTracks(),
          },
        ],
      },
    };
  }

  private saveToLocalStorage(): void {
    if (this.readOnly) return;
    try {
      if (typeof window === 'undefined') return;
      if (this.migrationBackup !== null) {
        let suffix = 0;
        while (true) {
          const key = suffix === 0 ? MIGRATION_BACKUP_KEY : `${MIGRATION_BACKUP_KEY}_${suffix}`;
          const existing = localStorage.getItem(key);
          if (existing === null) {
            localStorage.setItem(key, this.migrationBackup);
            break;
          }
          if (existing === this.migrationBackup) break;
          suffix++;
        }
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

  public isReadOnly(): boolean {
    return this.readOnly;
  }

  public getState(): ProjectState {
    return this.state;
  }

  public getSelectedTrackIndex(): number {
    return this.selectedTrackIndex;
  }

  public setSelectedTrackIndex(trackIndex: number): void {
    if (!validTrack(trackIndex)) throw new Error('Invalid track index.');
    if (trackIndex === this.selectedTrackIndex) return;
    this.selectedTrackIndex = trackIndex;
    this.notifyListeners();
  }

  public getLiveEraseState(): LivePadEraseState {
    return { ...this.liveEraseState };
  }

  public setLiveEraseHold(isEraseHeld: boolean, targetPadId?: string | null): LivePadEraseState {
    this.liveEraseState = setEraseHold(this.liveEraseState, isEraseHeld, targetPadId);
    return { ...this.liveEraseState };
  }

  public setLiveEraseTargetPad(targetPadId: string | null): LivePadEraseState {
    this.liveEraseState = setLiveEraseTargetPad(this.liveEraseState, targetPadId);
    return { ...this.liveEraseState };
  }

  public syncLiveEraseTransport(params: { isRecording?: boolean; activeBus?: FxBus }): LivePadEraseState {
    this.liveEraseState = syncLiveEraseTransport(this.liveEraseState, params);
    return { ...this.liveEraseState };
  }

  public getPadAdsr(padId: string): AHDSRParams {
    const pad = this.state.sampler.pads[padId];
    return normalizeAHDSR(pad?.adsr ?? createDefaultAHDSRParams());
  }

  public setPadAdsr(padId: string, envelope: Partial<AHDSRParams>): AHDSRParams {
    this.assertWritable();
    const pad = this.state.sampler.pads[padId];
    if (!pad) throw new Error('Invalid pad ID.');
    const nextAdsr = normalizeAHDSR({
      ...this.getPadAdsr(padId),
      ...envelope,
    });
    pad.adsr = nextAdsr;
    this.notify();
    return nextAdsr;
  }

  public resetPadAdsr(
    padId: string,
    reason: 'pad-cleared' | 'sample-loaded' | 'manual-reset' = 'manual-reset',
    recordHistory = true,
  ): { adsr: AHDSRParams; resetApplied: boolean; defaults: AdsrEnvelopeDefaults } {
    const resolution = resolveAdsrOnPadEvent(reason);
    const nextAdsr = createDefaultAHDSRParams();
    const pad = this.state.sampler.pads[padId];
    if (pad && !this.readOnly) {
      pad.adsr = nextAdsr;
      if (recordHistory) {
        this.notify();
      } else {
        this.saveToLocalStorage();
        this.notifyListeners();
      }
    }
    return {
      adsr: nextAdsr,
      resetApplied: resolution.shouldReset,
      defaults: resolution.defaults,
    };
  }

  public subscribe(listener: ProjectStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private notify(recordHistory = true): void {
    if (recordHistory) this.undoStack.push(this.state);
    this.saveToLocalStorage(); // Auto-save on every state change
    this.notifyListeners();
  }

  private restoreSnapshot(snapshot: UndoableProjectData): void {
    const patterns = snapshot.tracker.patterns;
    const candidate: ProjectState = {
      ...this.state,
      settings: {
        ...this.state.settings,
        bpm: snapshot.settings.bpm,
        activePatternIndex: Math.max(0, Math.min(snapshot.settings.activePatternIndex, patterns.length - 1)),
      },
      tracker: { patterns, tables: snapshot.tracker.tables },
    };
    migrateProject(candidate); // Validates before anything is replaced.
    this.state = candidate;
  }

  public undo(): boolean {
    if (this.readOnly || !this.undoStack.undo((snapshot) => this.restoreSnapshot(snapshot))) return false;
    this.notify(false);
    return true;
  }

  public redo(): boolean {
    if (this.readOnly || !this.undoStack.redo((snapshot) => this.restoreSnapshot(snapshot))) return false;
    this.notify(false);
    return true;
  }

  public canUndo(): boolean {
    return !this.readOnly && this.undoStack.canUndo();
  }

  public canRedo(): boolean {
    return !this.readOnly && this.undoStack.canRedo();
  }

  public setBpm(bpm: number): void {
    this.assertWritable();
    if (!Number.isFinite(bpm)) throw new Error('Tempo must be finite.');
    const clampedBpm = Math.max(40, Math.min(300, bpm));
    if (clampedBpm === this.state.settings.bpm) return;
    this.state.settings.bpm = clampedBpm;
    this.notify();
  }

  public setMasterVolume(volume: number): void {
    this.assertWritable();
    const clampedVol = Math.max(0, Math.min(1, volume));
    this.state.settings.masterVolume = clampedVol;
    this.notify();
  }

  public createPattern(): void {
    this.assertWritable();
    const patterns = this.state.tracker.patterns;
    const id = patterns.reduce((max, pattern) => Math.max(max, pattern.id), 0) + 1;
    patterns.push({
      id,
      name: `Pattern ${String(id).padStart(2, '0')}`,
      length: PHRASE_LENGTH,
      tracks: createTracks(),
    });
    this.state.settings.activePatternIndex = patterns.length - 1;
    this.notify();
  }

  public setActivePattern(index: number): void {
    this.assertWritable();
    if (!Number.isInteger(index) || !this.state.tracker.patterns[index]) return;
    this.state.settings.activePatternIndex = index;
    this.notify();
  }

  public setPatternLength(patternIndex: number, length: PhraseLength): void {
    this.assertWritable();
    const pattern = this.state.tracker.patterns[patternIndex];
    if (!pattern || !isPhraseLength(length)) throw new Error('Invalid phrase length or pattern.');
    if (pattern.length === length) return;
    for (const track of pattern.tracks) {
      while (track.steps.length < length) track.steps.push(emptyStep());
    }
    pattern.length = length;
    this.notify();
  }

  public updatePadMetadata(padId: string, metadata: Partial<PadProjectData>): void {
    this.assertWritable();
    if (!this.state.sampler.pads[padId]) return;
    if ('targetTrack' in metadata && !validTrack(metadata.targetTrack as number)) throw new Error('Invalid target track.');
    this.state.sampler.pads[padId] = {
      ...this.state.sampler.pads[padId],
      ...metadata,
      ...(metadata.adsr !== undefined ? { adsr: normalizeAHDSR(metadata.adsr) } : {}),
    };
    this.notify();
  }

  public setPadTargetTrack(padId: string, track: number): void {
    this.assertWritable();
    if (!this.state.sampler.pads[padId]) throw new Error('Invalid pad ID.');
    if (!validTrack(track)) throw new Error('Invalid target track.');
    this.state.sampler.pads[padId].targetTrack = track;
    this.notify();
  }

  public setPadVolume(padId: string, volume: number): void {
    this.assertWritable();
    const pad = this.state.sampler.pads[padId];
    if (!pad) throw new Error('Invalid pad ID.');
    validateVolume(volume);
    pad.volume = volume;
    this.notify();
  }

  public setPadChokeGroup(padId: string, chokeGroup: number | null): void {
    this.assertWritable();
    const pad = this.state.sampler.pads[padId];
    if (!pad) throw new Error('Invalid pad ID.');
    if (chokeGroup !== null && (!Number.isInteger(chokeGroup) || chokeGroup < 1 || chokeGroup > 8)) {
      throw new Error('Choke group must be 1 through 8 or none.');
    }
    pad.chokeGroup = chokeGroup;
    this.notify();
  }

  public setTrackVolume(trackIndex: number, volume: number): void {
    this.assertWritable();
    if (!validTrack(trackIndex)) throw new Error('Invalid track index.');
    validateVolume(volume);
    const volumes =
      this.state.settings.trackVolumes ?? (this.state.settings.trackVolumes = Array(TRACK_COUNT).fill(1));
    volumes[trackIndex] = volume;
    this.notify();
  }

  public setPadPolyphonic(padId: string, isPolyphonic: boolean): void {
    this.assertWritable();
    const pad = this.state.sampler.pads[padId];
    if (!pad) throw new Error('Invalid pad ID.');
    if (typeof isPolyphonic !== 'boolean') throw new Error('Polyphonic state must be a boolean.');
    if (pad.isPolyphonic === isPolyphonic) return;
    pad.isPolyphonic = isPolyphonic;
    this.notify();
  }

  public isPadPolyphonic(padId: string): boolean {
    const pad = this.state.sampler.pads[padId];
    if (!pad) throw new Error('Invalid pad ID.');
    return pad.isPolyphonic;
  }

  public applyControlAll(offsets: ControlAll): void {
    this.assertWritable();
    if (!offsets || typeof offsets !== 'object') throw new Error('Invalid control-all offsets.');
    const padOffset = offsets.padVolumeOffset ?? 0;
    const trackOffset = offsets.trackVolumeOffset ?? 0;
    if (!Number.isFinite(padOffset) || !Number.isFinite(trackOffset)) {
      throw new Error('Control-all offsets must be finite.');
    }

    let changed = false;
    for (const padId of Object.keys(this.state.sampler.pads)) {
      const pad = this.state.sampler.pads[padId];
      const volume = Math.max(0, Math.min(1, pad.volume + padOffset));
      if (volume !== pad.volume) {
        pad.volume = volume;
        changed = true;
      }
    }
    if (trackOffset !== 0) {
      const volumes =
        this.state.settings.trackVolumes ?? (this.state.settings.trackVolumes = Array(TRACK_COUNT).fill(1));
      for (let index = 0; index < TRACK_COUNT; index++) {
        const volume = Math.max(0, Math.min(1, volumes[index] + trackOffset));
        if (volume !== volumes[index]) {
          volumes[index] = volume;
          changed = true;
        }
      }
    }
    if (changed) this.notify();
  }

  private getTrack(patternIndex: number, trackIndex: number): PhraseTrack {
    if (!Number.isInteger(patternIndex) || !this.state.tracker.patterns[patternIndex]) {
      throw new Error('Invalid pattern index.');
    }
    if (!validTrack(trackIndex)) throw new Error('Invalid track index.');
    return this.state.tracker.patterns[patternIndex].tracks[trackIndex];
  }

  private validateStepIndex(patternIndex: number, stepIndex: number): void {
    if (
      !Number.isInteger(stepIndex) ||
      stepIndex < 0 ||
      stepIndex >= this.state.tracker.patterns[patternIndex].length
    ) {
      throw new Error('Invalid step index.');
    }
  }

  public updateStep(
    patternIndex: number,
    stepIndex: number,
    stepData: Partial<TrackerStepItem>,
    trackIndex = 0,
  ): void {
    this.assertWritable();
    const track = this.getTrack(patternIndex, trackIndex);
    this.validateStepIndex(patternIndex, stepIndex);
    const previous = track.steps[stepIndex];
    const invalidatesRecordedEvents =
      Boolean(previous.events?.length) &&
      (stepData.note !== undefined ||
        stepData.instrumentId !== undefined ||
        stepData.subTickOffset !== undefined ||
        stepData.velocity !== undefined ||
        stepData.sliceIndex !== undefined ||
        stepData.fx !== undefined ||
        stepData.fxValue !== undefined ||
        stepData.fx2 !== undefined ||
        stepData.fx2Value !== undefined ||
        stepData.fx3 !== undefined ||
        stepData.fx3Value !== undefined);
    const updated = {
      ...previous,
      ...(previous.sliceIndex !== undefined &&
      stepData.instrumentId !== undefined &&
      stepData.instrumentId !== previous.instrumentId
        ? { sliceIndex: undefined }
        : {}),
      ...stepData,
      ...(invalidatesRecordedEvents ? { events: undefined } : {}),
    };
    if ('sampleId' in updated) throw new Error('Legacy sample ID in phrase track.');
    track.steps[stepIndex] = migrateStep(updated);
    this.notify();
  }

  public clearStepNotes(patternIndex: number, stepIndices: readonly number[], trackIndex = 0): void {
    this.assertWritable();
    const track = this.getTrack(patternIndex, trackIndex);
    stepIndices.forEach((index) => this.validateStepIndex(patternIndex, index));
    let changed = false;
    for (const index of new Set(stepIndices)) {
      const step = track.steps[index];
      if ((!step.note || step.note === '---') && step.instrumentId === null && step.events === undefined) continue;
      track.steps[index] = {
        ...step,
        note: '---',
        instrumentId: null,
        subTickOffset: 0,
        velocity: undefined,
        tableId: null,
        sliceIndex: undefined,
        events: undefined,
      };
      changed = true;
    }
    if (changed) this.notify();
  }

  public erasePadAtStep(
    patternIndex: number,
    stepIndex: number,
    padId: string,
    subtickIndex?: number,
    trackIndex = this.selectedTrackIndex,
  ): boolean {
    this.assertWritable();
    const track = this.getTrack(patternIndex, trackIndex);
    this.validateStepIndex(patternIndex, stepIndex);
    const targetInstrumentId = padIdToInstrumentId(padId);
    if (targetInstrumentId === null) return false;

    const step = track.steps[stepIndex];
    const records: SequencerStepRecord[] = [
      {
        stepIndex,
        trackIndex,
        padId: instrumentIdToPadId(step.instrumentId),
        instrumentId: step.instrumentId !== null ? String(step.instrumentId) : null,
        note: step.note,
      },
    ];
    const eraseState: LivePadEraseState = {
      ...this.liveEraseState,
      isEraseHeld: true,
      targetPadId: padId,
    };
    const res = erasePadAtStepAndSubtick(eraseState, records, stepIndex, subtickIndex);
    this.liveEraseState = res.state;
    if (!res.didErase) return false;

    const updatedRecord = res.steps[0];
    const remainingEvents =
      subtickIndex !== undefined && Array.isArray(step.events)
        ? step.events.filter((ev, idx) => idx !== subtickIndex || ev.padId !== targetInstrumentId)
        : step.events?.filter((ev) => ev.padId !== targetInstrumentId);

    const stillHasEvents = Boolean(remainingEvents && remainingEvents.length > 0);
    track.steps[stepIndex] = {
      ...step,
      note: stillHasEvents ? remainingEvents![remainingEvents!.length - 1].note : updatedRecord.note ?? '---',
      instrumentId: stillHasEvents
        ? remainingEvents![remainingEvents!.length - 1].instrumentId ??
          remainingEvents![remainingEvents!.length - 1].padId
        : null,
      subTickOffset: stillHasEvents ? remainingEvents![remainingEvents!.length - 1].subTickOffset : 0,
      velocity: stillHasEvents ? remainingEvents![remainingEvents!.length - 1].velocity : undefined,
      sliceIndex: stillHasEvents ? step.sliceIndex : undefined,
      events: stillHasEvents ? remainingEvents : undefined,
    };
    this.notify();
    return true;
  }

  public clearPadSteps(patternIndex: number, padId: string, trackIndex?: number): number {
    this.assertWritable();
    const pattern = this.state.tracker.patterns[patternIndex];
    if (!pattern) throw new Error('Invalid pattern index.');
    const targetInstrumentId = padIdToInstrumentId(padId);
    if (targetInstrumentId === null) return 0;

    const tracksToScan =
      trackIndex === undefined ? pattern.tracks : [this.getTrack(patternIndex, trackIndex)];
    let totalCleared = 0;

    for (const track of tracksToScan) {
      const records: SequencerStepRecord[] = track.steps.map((step, idx) => ({
        stepIndex: idx,
        trackIndex: track.id,
        padId: instrumentIdToPadId(step.instrumentId),
        instrumentId: step.instrumentId !== null ? String(step.instrumentId) : null,
        note: step.note,
      }));
      const cleared = clearPadScope(records, padId);
      totalCleared += cleared.clearedCount;
      cleared.items.forEach((rec, idx) => {
        const current = track.steps[idx];
        const filteredEvents = current.events?.filter((ev) => ev.padId !== targetInstrumentId);
        const hasRemaining = Boolean(filteredEvents && filteredEvents.length > 0);
        if (rec.padId === null && current.instrumentId === targetInstrumentId && !hasRemaining) {
          track.steps[idx] = {
            ...current,
            note: '---',
            instrumentId: null,
            subTickOffset: 0,
            velocity: undefined,
            sliceIndex: undefined,
            events: undefined,
          };
        } else if (filteredEvents?.length !== current.events?.length) {
          track.steps[idx] = {
            ...current,
            events: hasRemaining ? filteredEvents : undefined,
          };
        }
      });
    }

    if (totalCleared > 0) {
      this.resetPadAdsr(padId, 'pad-cleared', false);
      this.notify();
    }
    return totalCleared;
  }

  public clearTrackSteps(patternIndex: number, trackIndex: number): number {
    this.assertWritable();
    const track = this.getTrack(patternIndex, trackIndex);
    const records: SequencerStepRecord[] = track.steps.map((step, idx) => ({
      stepIndex: idx,
      trackIndex: track.id,
      padId: instrumentIdToPadId(step.instrumentId),
      instrumentId: step.instrumentId !== null ? String(step.instrumentId) : null,
      note: step.note,
      fx1: step.fx ?? null,
      fx2: step.fx2 ?? null,
      fx3: step.fx3 ?? null,
    }));
    const result = clearTrackScope(records, trackIndex);
    if (result.clearedCount > 0) {
      track.steps = track.steps.map(() => emptyStep());
      this.notify();
    }
    return result.clearedCount;
  }

  public clearAllTableSteps(tableId: number, trackIndex = this.selectedTrackIndex): number {
    this.assertWritable();
    if (!validTrack(trackIndex)) throw new Error('Invalid track index.');
    const table = this.getTables().find((item) => item.id === tableId);
    if (!table) return 0;
    if (table.trackIndex !== trackIndex) throw new Error('Table is bound to a different track.');
    const rows: TableRowRecord[] = table.steps.map((step, idx) => ({
      tableStep: idx,
      padId: step.pitch !== null || step.fx || step.fx2 || step.fx3 ? String(idx) : null,
    }));
    const cleared = clearTableScope(rows);
    table.steps = table.steps.map((step) => ({
      pitch: null,
      volume: step.volume ?? null,
    }));
    this.notify();
    return cleared.clearedCount;
  }

  public punchReplaceLane(
    patternIndex: number,
    stepIndex: number,
    trackIndex: number,
    stepData: TrackerStepItem,
  ): void {
    this.assertWritable();
    const track = this.getTrack(patternIndex, trackIndex);
    this.validateStepIndex(patternIndex, stepIndex);
    if (!stepData || typeof stepData !== 'object' || Array.isArray(stepData)) throw new Error('Invalid phrase step.');
    if ('sampleId' in stepData) throw new Error('Legacy sample ID in phrase track.');
    const replacement = migrateStep(stepData);
    track.steps[stepIndex] = {
      ...replacement,
      ...(replacement.events ? { events: [...replacement.events] } : {}),
    };
    this.notify();
  }

  public recordHit(
    patternIndex: number,
    stepIndex: number,
    preferredTrack: number,
    event: TrackerStepItem,
  ): number | null {
    this.assertWritable();
    this.getTrack(patternIndex, preferredTrack);
    this.validateStepIndex(patternIndex, stepIndex);
    const normalizedEvent = migrateStep(event);
    if ('sampleId' in event) throw new Error('Legacy sample ID in phrase track.');
    if (!normalizedEvent.note || normalizedEvent.note === '---' || normalizedEvent.instrumentId === null) {
      throw new Error('Invalid recorded note.');
    }
    const velocity = normalizedEvent.velocity ?? 127;
    if (!Number.isInteger(velocity) || velocity < 0 || velocity > 127) throw new Error('Invalid velocity.');
    const pattern = this.state.tracker.patterns[patternIndex];
    const track = pattern.tracks[this.selectedTrackIndex];
    const step = track.steps[stepIndex];
    if (
      step.instrumentId === normalizedEvent.instrumentId &&
      step.note === normalizedEvent.note &&
      step.sliceIndex === normalizedEvent.sliceIndex &&
      (step.subTickOffset ?? 0) === (normalizedEvent.subTickOffset ?? 0)
    ) {
      track.steps[stepIndex] = { ...step, velocity, events: undefined };
    } else {
      track.steps[stepIndex] = { ...normalizedEvent, velocity, events: undefined };
    }
    this.notify();
    return this.selectedTrackIndex;
  }

  public recordLiveHit(
    patternIndex: number,
    stepIndex: number,
    event: TrackerStepItem,
    recordedEvent: StepEvent,
  ): number {
    this.assertWritable();
    const track = this.getTrack(patternIndex, this.selectedTrackIndex);
    this.validateStepIndex(patternIndex, stepIndex);
    validateStepEvent(recordedEvent);
    const normalizedEvent = migrateStep(event);
    if (!normalizedEvent.note || normalizedEvent.note === '---' || normalizedEvent.instrumentId === null) {
      throw new Error('Invalid recorded note.');
    }
    const velocity = normalizedEvent.velocity ?? recordedEvent.velocity;
    if (!Number.isInteger(velocity) || velocity < 0 || velocity > 127) throw new Error('Invalid velocity.');

    const previous = track.steps[stepIndex];
    const previousEvents = (previous.events ?? []).slice(-MAX_RECORDED_EVENTS_PER_STEP);
    const eventToRecord = { ...recordedEvent, velocity };
    const events =
      previousEvents.length < MAX_RECORDED_EVENTS_PER_STEP
        ? [...previousEvents, eventToRecord]
        : [...previousEvents.slice(1), eventToRecord];
    const updated = {
      ...previous,
      note: normalizedEvent.note,
      instrumentId: normalizedEvent.instrumentId,
      subTickOffset: normalizedEvent.subTickOffset,
      velocity,
      ...(normalizedEvent.sliceIndex === undefined ? {} : { sliceIndex: normalizedEvent.sliceIndex }),
      events,
    };
    if (normalizedEvent.sliceIndex === undefined) delete updated.sliceIndex;
    track.steps[stepIndex] = updated;
    this.notify();
    return this.selectedTrackIndex;
  }

  public recordPolyphonicHit(
    patternIndex: number,
    stepIndex: number,
    preferredTrack: number,
    event: StepEvent,
  ): number | null {
    this.assertWritable();
    this.getTrack(patternIndex, preferredTrack);
    this.validateStepIndex(patternIndex, stepIndex);
    validateStepEvent(event);
    const padId = `${String.fromCharCode(65 + Math.floor(event.padId / 16))}${(event.padId % 16) + 1}`;
    if (!this.isPadPolyphonic(padId)) throw new Error(`Pad ${padId} is not configured for polyphonic recording.`);
    const pattern = this.state.tracker.patterns[patternIndex];
    const track = pattern.tracks[this.selectedTrackIndex];
    const step = track.steps[stepIndex];
    const previousEvents = (step.events ?? []).slice(-MAX_RECORDED_EVENTS_PER_STEP);
    const events = previousEvents.length
      ? previousEvents.length < MAX_RECORDED_EVENTS_PER_STEP
        ? [...previousEvents, event]
        : [...previousEvents.slice(1), event]
      : [event];
    track.steps[stepIndex] = {
      ...step,
      note: event.note,
      instrumentId: event.instrumentId ?? event.padId,
      subTickOffset: event.subTickOffset,
      velocity: event.velocity,
      events,
    };
    this.notify();
    return this.selectedTrackIndex;
  }

  public recordPadHit(
    patternIndex: number,
    stepIndex: number,
    preferredTrack: number,
    event: StepEvent,
  ): number | null {
    validateStepEvent(event);
    const padId = `${String.fromCharCode(65 + Math.floor(event.padId / 16))}${(event.padId % 16) + 1}`;
    if (this.isPadPolyphonic(padId)) {
      return this.recordPolyphonicHit(patternIndex, stepIndex, preferredTrack, event);
    }
    this.getTrack(patternIndex, preferredTrack);
    return this.recordLiveHit(
      patternIndex,
      stepIndex,
      {
        note: event.note,
        instrumentId: event.instrumentId ?? event.padId,
        subTickOffset: event.subTickOffset,
        velocity: event.velocity,
        fx: event.fx,
        fxValue: event.fxValue,
      },
      event,
    );
  }

  public applyEuclideanPattern(
    patternIndex: number,
    trackIndex: number,
    hits: readonly boolean[],
    instrumentId: number,
  ): void {
    this.assertWritable();
    const track = this.getTrack(patternIndex, trackIndex);
    const pattern = this.state.tracker.patterns[patternIndex];
    if (hits.length > pattern.length || hits.some((hit) => typeof hit !== 'boolean')) {
      throw new Error('Euclidean pattern must contain no more steps than the active phrase.');
    }
    if (!Number.isInteger(instrumentId) || instrumentId < 0 || instrumentId > 63) {
      throw new Error('Invalid instrument ID for Euclidean pattern.');
    }
    for (let index = 0; index < pattern.length; index++) {
      const previous = track.steps[index];
      if (hits[index]) {
        track.steps[index] = {
          ...previous,
          note: 'C-4',
          instrumentId,
          velocity: previous.velocity ?? 127,
          events: undefined,
        };
      } else if (index < hits.length) {
        track.steps[index] = {
          ...previous,
          note: '---',
          instrumentId: null,
          subTickOffset: undefined,
          velocity: undefined,
          sliceIndex: undefined,
          events: undefined,
        };
      }
    }
    this.notify();
  }

  public recordRelease(
    patternIndex: number,
    stepIndex: number,
    trackIndex: number,
    instrumentId: number,
    subTickOffset: number,
  ): boolean {
    this.assertWritable();
    const track = this.getTrack(patternIndex, trackIndex);
    this.validateStepIndex(patternIndex, stepIndex);
    const step = track.steps[stepIndex];
    const empty =
      step.note === '---' &&
      step.instrumentId === null &&
      Object.entries(step).every(
        ([key, value]) =>
          key === 'note' ||
          key === 'instrumentId' ||
          value == null ||
          (key === 'subTickOffset' && value === 0) ||
          (key === 'fx' && value === ''),
      );
    if (!empty) return false;
    const releaseStep = migrateStep({ note: 'OFF', instrumentId, subTickOffset });
    track.steps[stepIndex] = releaseStep;
    this.notify();
    return true;
  }

  public getTables(trackIndex?: number): TrackerTable[] {
    const tables = this.state.tracker.tables ?? [];
    return trackIndex === undefined ? tables : tables.filter((table) => table.trackIndex === trackIndex);
  }

  public createTable(trackIndex = this.selectedTrackIndex): number {
    this.assertWritable();
    if (!validTrack(trackIndex)) throw new Error('Invalid track index.');
    const tables = this.state.tracker.tables ?? (this.state.tracker.tables = []);
    const id = tables.reduce((max, table) => Math.max(max, table.id), 0) + 1;
    tables.push({
      id,
      name: `Table ${String(id).padStart(2, '0')}`,
      trackIndex,
      steps: Array.from({ length: TABLE_PAGE_TICKS * TABLE_PAGES }, () => ({ pitch: null, volume: null })),
    });
    this.notify();
    return id;
  }

  public updateTableStep(
    tableId: number,
    stepIndex: number,
    changes: Partial<TableStep>,
    trackIndex = this.selectedTrackIndex,
  ): void {
    this.assertWritable();
    if (!validTrack(trackIndex)) throw new Error('Invalid track index.');
    const table = this.getTables().find((item) => item.id === tableId);
    if (table && table.trackIndex !== trackIndex) throw new Error('Table is bound to a different track.');
    const step = table?.steps[stepIndex];
    if (!step) return;
    if (
      changes.pitch !== undefined &&
      changes.pitch !== null &&
      (!Number.isInteger(changes.pitch) || changes.pitch < -24 || changes.pitch > 24)
    ) {
      throw new Error('Table pitch must be -24 to 24.');
    }
    if (
      changes.volume !== undefined &&
      changes.volume !== null &&
      (!Number.isInteger(changes.volume) || changes.volume < 0 || changes.volume > 127)
    ) {
      throw new Error('Table volume must be 0 to 127.');
    }
    if (
      changes.subTickOffset !== undefined &&
      (!Number.isInteger(changes.subTickOffset) || changes.subTickOffset < -8 || changes.subTickOffset > 8)
    ) {
      throw new Error('Table microtiming must be -8 to 8.');
    }
    const sanitizedChanges: Partial<TableStep> = { ...changes };
    if ((sanitizedChanges.fx as string | undefined) === 'DR') sanitizedChanges.fx = 'OFF';
    if ((sanitizedChanges.fx2 as string | undefined) === 'DR') sanitizedChanges.fx2 = 'OFF';
    if (sanitizedChanges.fx !== undefined && sanitizedChanges.fx !== null && !VOICE_SLOT_CODES.has(sanitizedChanges.fx)) {
      throw new Error(`Invalid Table FX1 opcode: ${String(sanitizedChanges.fx)}`);
    }
    if (
      sanitizedChanges.fx2 !== undefined &&
      sanitizedChanges.fx2 !== null &&
      !VOICE_SLOT_CODES.has(sanitizedChanges.fx2)
    ) {
      throw new Error(`Invalid Table FX2 opcode: ${String(sanitizedChanges.fx2)}`);
    }
    if (
      sanitizedChanges.fx3 !== undefined &&
      sanitizedChanges.fx3 !== null &&
      !PUNCH_IN_SLOT_CODES.has(sanitizedChanges.fx3)
    ) {
      throw new Error(`Invalid Table FX3 punch-in opcode: ${String(sanitizedChanges.fx3)}`);
    }
    if (sanitizedChanges.fxValue !== undefined) sanitizedChanges.fxValue = sanitizeFxSlotValue(sanitizedChanges.fxValue);
    if (sanitizedChanges.fx2Value !== undefined) sanitizedChanges.fx2Value = sanitizeFxSlotValue(sanitizedChanges.fx2Value);
    if (sanitizedChanges.fx3Value !== undefined) sanitizedChanges.fx3Value = sanitizeFxSlotValue(sanitizedChanges.fx3Value);
    Object.assign(step, sanitizedChanges);
    this.notify();
  }

  public clearTableSteps(tableId: number, stepIndices: readonly number[], trackIndex = this.selectedTrackIndex): void {
    this.assertWritable();
    if (!validTrack(trackIndex)) throw new Error('Invalid track index.');
    const table = this.getTables().find((item) => item.id === tableId);
    if (table && table.trackIndex !== trackIndex) throw new Error('Table is bound to a different track.');
    if (!table) return;
    let changed = false;
    for (const index of new Set(stepIndices)) {
      const step = table.steps[index];
      if (!step || (step.pitch === null && !step.reset && !step.fx && !step.fx2 && !step.fx3 && step.subTickOffset === undefined)) {
        continue;
      }
      table.steps[index] = { pitch: null, volume: step.volume };
      changed = true;
    }
    if (changed) this.notify();
  }

  /**
   * Export project state as a downloadable JSON file (.spm8x)
   */
  public exportProjectJson(): void {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `sp-m8x-project-${Date.now()}.spm8x`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  /**
   * Import project state from a JSON string or parsed object
   */
  public importProjectJson(jsonData: ProjectState): void {
    this.assertWritable();
    if (!jsonData || !jsonData.settings || !jsonData.sampler || !jsonData.tracker) {
      console.error('[ProjectController] Invalid project file format.');
      return;
    }
    const original = JSON.stringify(jsonData);
    const imported = JSON.parse(original) as ProjectState;
    const migrated = migrateProject(imported);
    if (migrated && this.migrationBackup !== null && this.migrationBackup !== original) {
      throw new Error('Pending migration backup must be saved before importing another legacy project.');
    }
    if (migrated && this.migrationBackup === null) this.migrationBackup = original;
    this.state = imported;
    this.undoStack.seed(this.state);
    this.notify(false);
    console.log('[ProjectController] Project successfully imported and state updated.');
  }
}

export const projectController = new ProjectController();
