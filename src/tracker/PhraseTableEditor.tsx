import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  projectController,
  type Pattern,
  type PhraseLength,
  type PunchInSlotFxCode,
  type TrackerStepItem,
  type TrackerTable,
  type VoiceSlotFxCode,
} from '../project/projectController';
import type { PadSlot } from '../sampler/usePadBank';
import { getGrooveDelayedSteps, type GroovePreset } from './groovePresets';
import { instrumentIdToPadId, padIdToInstrumentId } from '../sampler/padIds';
import { generateEuclideanSteps } from './euclideanGenerator';
import {
  closeMagnifier,
  createInitialTableWindowState,
  latchTableRowToMicroOffset,
  openSubtickMagnifier,
  setTablePage,
  syncPlayheadToTableWindow,
  type TableWindowState,
  type ViewportRect,
} from '../table/tableWindowState';

const fieldClass = 'phrase-cell-control bg-zinc-950 border border-zinc-700 text-zinc-100 min-w-0';
const buttonClass = 'border border-zinc-700 px-2 py-1 text-zinc-300 shrink-0';
const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = (midi: number) => `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;
const stepNumber = (stepIndex: number) => String(stepIndex + 1).padStart(2, '0');
const QUICK_SPANS = [2, 4, 8, 16, 32, 64] as const;
const VOICE_FX_OPTIONS: readonly VoiceSlotFxCode[] = ['OFF', 'FL', 'DL', 'PS'];
const PUNCH_FX3_OPTIONS: readonly PunchInSlotFxCode[] = ['OFF', 'PM', 'LF', 'BC'];

const PHRASE_GRID_TEMPLATE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    '52px minmax(84px, 1fr) minmax(68px, 0.9fr) minmax(64px, 0.85fr) minmax(76px, 0.95fr) minmax(86px, 1fr) minmax(64px, 0.8fr) minmax(64px, 0.8fr) minmax(64px, 0.8fr) minmax(64px, 0.8fr)',
  columnGap: '4px',
  alignItems: 'center',
};

const TABLE_GRID_TEMPLATE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    '92px minmax(72px, 0.9fr) minmax(96px, 1.1fr) minmax(110px, 1.4fr) minmax(76px, 0.9fr) minmax(76px, 0.9fr)',
  columnGap: '6px',
  alignItems: 'center',
};

export interface EditorProps {
  slots: Record<string, PadSlot>;
  activeStep: number;
  activeSubtick: number;
  groovePreset: GroovePreset;
  transportPlaying: boolean;
  transportPaused: boolean;
  transportBusy: boolean;
  mode: 'phrase' | 'table';
  queuedPatternIndex: number | null;
  onSelectPattern: (index: number) => void;
  linkedPad?: { padId: string; name: string; playMode: string; sliActive?: boolean; sliceMarkers?: number[] };
  contextLock?: boolean;
  onToggleContextLock?: () => void;
  tableWindow?: TableWindowState;
  onTableWindowChange?: (next: TableWindowState) => void;
}

function normalizeVoiceFx(raw: unknown): VoiceSlotFxCode {
  if (typeof raw !== 'string') return 'OFF';
  const upper = raw.toUpperCase();
  if (upper === 'FL' || upper === 'DL' || upper === 'PS') return upper;
  return 'OFF';
}

function normalizePunchFx3(raw: unknown): PunchInSlotFxCode {
  if (typeof raw !== 'string') return 'OFF';
  const upper = raw.toUpperCase();
  if (upper === 'PM' || upper === 'LF' || upper === 'BC') return upper;
  return 'OFF';
}

function clampSubtickOffset(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(-8, Math.min(8, Math.round(raw)));
}

function getStackedPadIds(step: TrackerStepItem): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const pushId = (id: string | null) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };

  pushId(instrumentIdToPadId(step.instrumentId));
  if (Array.isArray(step.events)) {
    for (const ev of step.events) {
      const candidate =
        typeof ev.instrumentId === 'number'
          ? instrumentIdToPadId(ev.instrumentId)
          : instrumentIdToPadId(ev.padId);
      pushId(candidate);
    }
  }
  return ordered;
}

export function PhraseTableEditor({
  slots,
  activeStep,
  activeSubtick,
  groovePreset,
  transportPlaying,
  transportPaused,
  transportBusy,
  mode,
  queuedPatternIndex,
  onSelectPattern,
  linkedPad,
  contextLock = false,
  onToggleContextLock,
  tableWindow: externalTableWindow,
  onTableWindowChange,
}: EditorProps) {
  const [tableId, setTableId] = useState<number | null>(null);
  const [trackIndex, setTrackIndex] = useState(() => projectController.getSelectedTrackIndex());
  const [selectedClearPadIds, setSelectedClearPadIds] = useState<string[]>([]);
  const [clearStatus, setClearStatus] = useState('');
  const [focusedPhraseStepIndex, setFocusedPhraseStepIndex] = useState<number | null>(null);
  const [focusedPadId, setFocusedPadId] = useState<string | null>(null);
  const [internalTableWindow, setInternalTableWindow] = useState<TableWindowState>(() =>
    createInitialTableWindowState(null),
  );

  useEffect(() => projectController.subscribe(() => {
    setTrackIndex(projectController.getSelectedTrackIndex());
  }), []);

  const state = projectController.getState();
  const patternIndex = state.settings.activePatternIndex;
  const pattern = state.tracker.patterns[patternIndex];
  const tables = projectController.getTables(trackIndex);
  const table = tables.find((item) => item.id === tableId) ?? tables[0];
  const delayedSteps = useMemo(() => getGrooveDelayedSteps(groovePreset), [groovePreset]);
  const populatedPads = useMemo(
    () => Object.values(slots).filter((slot) => Boolean(slot.sampleKey || slot.buffer)),
    [slots],
  );

  const tableWindow = externalTableWindow ?? internalTableWindow;
  const updateTableWindow = (updater: (prev: TableWindowState) => TableWindowState) => {
    if (onTableWindowChange) {
      onTableWindowChange(updater(tableWindow));
    } else {
      setInternalTableWindow((prev) => updater(prev));
    }
  };

  useEffect(() => {
    if (mode !== 'table' && tableWindow.magnifier.isOpen) {
      updateTableWindow((prev) => closeMagnifier(prev));
    }
  }, [mode, tableWindow.magnifier.isOpen]);

  // Auto-focus the active pad's 8 subticks (step * 8 .. step * 8 + 7) when entering Table mode
  // from a Phrase step/pad selection, without touching audio clock scheduling.
  useEffect(() => {
    if (mode !== 'table' || contextLock || focusedPhraseStepIndex === null) return;
    const totalSteps = table?.steps.length ?? 512;
    if (totalSteps <= 0) return;
    const blockStart = Math.max(0, Math.min(totalSteps - 1, focusedPhraseStepIndex * 8));
    const targetPage = Math.floor(blockStart / 16);
    updateTableWindow((prev) => ({
      ...setTablePage(prev, targetPage),
      tableId: table ? String(table.id) : prev.tableId,
      followPlayhead: false,
      latchedIndicator: {
        phraseStepIndex: focusedPhraseStepIndex,
        microOffset:
          pattern?.tracks[trackIndex]?.steps[focusedPhraseStepIndex]?.subTickOffset ?? 0,
        latchedTableStep: blockStart,
        latchedPageIndex: targetPage,
      },
    }));
  }, [mode, contextLock, focusedPhraseStepIndex, table?.id, table?.steps.length, pattern, trackIndex]);

  const handleFocusPhraseStepPad = (stepIndex: number, padId: string | null) => {
    setFocusedPhraseStepIndex(stepIndex);
    if (padId) {
      setFocusedPadId(padId);
    }
    const step = pattern?.tracks[trackIndex]?.steps[stepIndex];
    if (typeof step?.tableId === 'number') {
      setTableId(step.tableId);
    }
  };

  const toggleClearPad = (padId: string) => {
    setSelectedClearPadIds((prev) =>
      prev.includes(padId) ? prev.filter((id) => id !== padId) : [...prev, padId],
    );
  };

  const handleClearPhrase = () => {
    if (!pattern) return;
    if (selectedClearPadIds.length > 0) {
      let totalCleared = 0;
      for (const padId of selectedClearPadIds) {
        totalCleared += projectController.clearPadSteps(patternIndex, padId, trackIndex);
      }
      setClearStatus(
        `CLEARED ${totalCleared} STEP(S) FOR ${selectedClearPadIds.join(', ')} ON TRK ${trackIndex + 1}`,
      );
      return;
    }
    const cleared = projectController.clearTrackSteps(patternIndex, trackIndex);
    setClearStatus(`CLEARED FULL PHRASE TRK ${trackIndex + 1} (${cleared} STEP(S))`);
  };

  const handleClearTable = () => {
    if (!table) return;
    if (selectedClearPadIds.length > 0) {
      const targetTableIds = new Set<number>([table.id]);
      for (const padId of selectedClearPadIds) {
        const instId = padIdToInstrumentId(padId);
        if (instId === null) continue;
        for (const phraseStep of pattern?.tracks[trackIndex]?.steps ?? []) {
          if (phraseStep.instrumentId === instId && typeof phraseStep.tableId === 'number') {
            targetTableIds.add(phraseStep.tableId);
          }
        }
      }
      let totalCleared = 0;
      for (const id of targetTableIds) {
        totalCleared += projectController.clearAllTableSteps(id, trackIndex);
      }
      setClearStatus(
        `CLEARED ${totalCleared} TABLE ROW(S) FOR ${selectedClearPadIds.join(', ')}`,
      );
      return;
    }
    const cleared = projectController.clearAllTableSteps(table.id, trackIndex);
    setClearStatus(`CLEARED FULL TABLE ${table.name} (${cleared} ROW(S))`);
  };

  if (!pattern) return <p role="alert">Active phrase is unavailable.</p>;

  const effectiveLinkedPad =
    focusedPadId && slots[focusedPadId]
      ? {
          padId: focusedPadId,
          name: slots[focusedPadId].name || focusedPadId,
          playMode: linkedPad?.playMode ?? 'one-shot',
          sliActive: linkedPad?.sliActive,
          sliceMarkers: linkedPad?.sliceMarkers,
        }
      : linkedPad;

  const focusedSubtickRange =
    focusedPhraseStepIndex !== null
      ? { start: focusedPhraseStepIndex * 8, end: focusedPhraseStepIndex * 8 + 7 }
      : null;

  return (
    <section className={`${mode === 'phrase' ? 'phrase-panel' : 'table-panel'} relative flex-1 min-h-0 flex flex-col gap-2 p-3 bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl font-mono text-xs overflow-visible`}>
      <div className="phrase-toolbar flex flex-wrap items-center gap-2">
        <label className="control-block">TRK <select aria-label="Phrase track" className={fieldClass} value={trackIndex}
          onChange={(event) => projectController.setSelectedTrackIndex(Number(event.target.value))}>
          {Array.from({ length: 8 }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
        </select></label>
        {mode === 'phrase' ? (
          <>
            <label className="control-block">PHR <select aria-label="Active phrase" className={fieldClass} value={queuedPatternIndex ?? patternIndex}
              onChange={(event) => onSelectPattern(Number(event.target.value))}>
              {state.tracker.patterns.map((item, index) => <option key={item.id} value={index}>{item.name}</option>)}
            </select></label>
            {queuedPatternIndex !== null && <span role="status" className="text-cyan-300">QUEUED</span>}
            <button type="button" className={buttonClass} aria-label="New phrase" disabled={transportBusy} onClick={() => projectController.createPattern()}>＋</button>
            <label className="control-block">LEN <select aria-label="Phrase length" className={fieldClass} value={pattern.length} disabled={transportBusy}
              onChange={(event) => projectController.setPatternLength(patternIndex, Number(event.target.value) as PhraseLength)}>
              {[16, 32, 64].map((length) => <option key={length} value={length}>{length}</option>)}
            </select></label>
            <button
              type="button"
              className={`${buttonClass} border-amber-500/70 text-amber-300`}
              aria-label={selectedClearPadIds.length > 0 ? 'Clear selected pads in phrase' : 'Clear full phrase'}
              disabled={transportBusy}
              onClick={handleClearPhrase}
            >
              {selectedClearPadIds.length > 0 ? `CLR PHR (${selectedClearPadIds.length})` : 'CLR PHR'}
            </button>
          </>
        ) : (
          <>
            <label className="control-block">TBL <select aria-label="Active table" className={fieldClass} value={table?.id ?? ''}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                setTableId(nextId);
                updateTableWindow((prev) => closeMagnifier({
                  ...prev,
                  tableId: Number.isFinite(nextId) && nextId > 0 ? String(nextId) : null,
                }));
              }}>
              {!table && <option value="">NONE</option>}
              {tables.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <button type="button" aria-label="New table" className={buttonClass}
              onClick={() => {
                const createdId = projectController.createTable(trackIndex);
                setTableId(createdId);
                updateTableWindow((prev) => closeMagnifier({
                  ...prev,
                  tableId: String(createdId),
                }));
              }}>＋</button>
            <button
              type="button"
              className={`${buttonClass} border-amber-500/70 text-amber-300`}
              aria-label={selectedClearPadIds.length > 0 ? 'Clear table for selected pads' : 'Clear full table'}
              disabled={!table}
              onClick={handleClearTable}
            >
              {selectedClearPadIds.length > 0 ? `CLR TBL (${selectedClearPadIds.length})` : 'CLR TBL'}
            </button>
            <button type="button" className={buttonClass} aria-label="Toggle table context lock"
              aria-pressed={contextLock} disabled={!effectiveLinkedPad} onClick={onToggleContextLock}>
              {contextLock ? 'PAD LOCK' : 'LINK PAD'}
            </button>
            {effectiveLinkedPad && <span role="status" className="text-cyan-300">
              {effectiveLinkedPad.padId} · {effectiveLinkedPad.name} · {effectiveLinkedPad.playMode.toUpperCase()}
              {effectiveLinkedPad.sliActive ? ` · SLI ${effectiveLinkedPad.sliceMarkers?.length ?? 0}` : ''}
              {contextLock ? ' · PINNED' : ''}
            </span>}
            {focusedSubtickRange && (
              <span role="status" className="text-emerald-300">
                8-SUB FOCUS S{focusedPhraseStepIndex! + 1}: {String(focusedSubtickRange.start + 1).padStart(3, '0')}-{String(focusedSubtickRange.end + 1).padStart(3, '0')}
              </span>
            )}
          </>
        )}
      </div>

      <div className="multi-pad-clear-scope flex flex-wrap items-center gap-1 text-[10px]" aria-label="Multi-pad clear selection">
        <span className="text-zinc-400 mr-1">PAD SCOPE:</span>
        {populatedPads.length === 0 ? (
          <span className="text-zinc-500">ALL PADS (NO LOADED PADS)</span>
        ) : (
          populatedPads.map((slot) => {
            const active = selectedClearPadIds.includes(slot.id);
            return (
              <button
                key={slot.id}
                type="button"
                aria-pressed={active}
                aria-label={`Select pad ${slot.id} for clear`}
                onClick={() => toggleClearPad(slot.id)}
                className={`px-1.5 py-0.5 border rounded font-bold ${
                  active
                    ? 'border-amber-400 bg-amber-950/60 text-amber-200'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                }`}
              >
                {slot.id}
              </button>
            );
          })
        )}
        {selectedClearPadIds.length > 0 && (
          <button
            type="button"
            className="px-1.5 py-0.5 border border-zinc-700 rounded text-zinc-300"
            onClick={() => {
              setSelectedClearPadIds([]);
              setClearStatus('');
            }}
          >
            CLEAR PAD SCOPE
          </button>
        )}
        {clearStatus && (
          <span role="status" className="text-amber-300 ml-1">
            {clearStatus}
          </span>
        )}
      </div>

      {mode === 'phrase'
        ? <PhraseRows
            key={`${pattern.id}-${trackIndex}-${pattern.length}`}
            pattern={pattern}
            patternIndex={patternIndex}
            trackIndex={trackIndex}
            slots={slots}
            activeStep={activeStep}
            groovePreset={groovePreset}
            playing={transportPlaying}
            delayedSteps={delayedSteps}
            transportBusy={transportBusy}
            contextLock={contextLock}
            focusedStepIndex={focusedPhraseStepIndex}
            focusedPadId={focusedPadId}
            onFocusStepPad={handleFocusPhraseStepPad}
            onLatchMicroStep={(phraseStepIndex, microOffset) =>
              updateTableWindow((prev) =>
                latchTableRowToMicroOffset(prev, phraseStepIndex, microOffset, 8),
              )
            }
          />
        : table
          ? <TableRows
              key={`${table.id}-${trackIndex}`}
              table={table}
              trackIndex={trackIndex}
              activeStep={activeStep}
              activeSubtick={activeSubtick}
              groovePreset={groovePreset}
              delayedSteps={delayedSteps}
              paused={transportPaused}
              playing={transportPlaying}
              tableWindow={tableWindow}
              focusedSubtickRange={focusedSubtickRange}
              onUpdateTableWindow={updateTableWindow}
            />
          : <p className="text-zinc-400">Create a reusable table, then assign it to a phrase step.</p>}
    </section>
  );
}

function PhraseRows({
  pattern,
  patternIndex,
  trackIndex,
  slots,
  activeStep,
  groovePreset,
  playing,
  delayedSteps,
  transportBusy,
  contextLock,
  focusedStepIndex,
  focusedPadId,
  onFocusStepPad,
  onLatchMicroStep,
}: {
  pattern: Pattern;
  patternIndex: number;
  trackIndex: number;
  slots: Record<string, PadSlot>;
  activeStep: number;
  groovePreset: GroovePreset;
  playing: boolean;
  delayedSteps: boolean[];
  transportBusy: boolean;
  contextLock: boolean;
  focusedStepIndex: number | null;
  focusedPadId: string | null;
  onFocusStepPad: (stepIndex: number, padId: string | null) => void;
  onLatchMicroStep: (phraseStepIndex: number, microOffset: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [euclideanOpen, setEuclideanOpen] = useState(false);
  const [euclideanSteps, setEuclideanSteps] = useState<number>(pattern.length);
  const [euclideanHits, setEuclideanHits] = useState(Math.min(4, pattern.length));
  const [euclideanRotation, setEuclideanRotation] = useState(0);
  const steps = pattern.tracks[trackIndex].steps;
  const firstLoadedPad = Object.values(slots).find((slot) => slot.sampleKey)?.id;
  const pads = Object.values(slots).filter((slot) => slot.sampleKey);
  const pageCount = pattern.length / 16;

  const toggleStep = (index: number) => {
    if (contextLock) return;
    const step = steps[index];
    const active = step && step.instrumentId !== null && step.note !== '---' && step.note !== 'OFF';
    if (active) {
      projectController.clearStepNotes(patternIndex, [index], trackIndex);
      onFocusStepPad(index, null);
    } else {
      const padId = focusedPadId ?? instrumentIdToPadId(step?.instrumentId) ?? firstLoadedPad;
      if (!padId) return;
      projectController.updateStep(patternIndex, index, {
        instrumentId: padIdToInstrumentId(padId),
        note: 'C-4',
        velocity: step?.velocity ?? 127,
      }, trackIndex);
      onFocusStepPad(index, padId);
    }
  };

  const applyMicroOffset = (index: number, rawOffset: number) => {
    const nextOffset = clampSubtickOffset(rawOffset);
    projectController.updateStep(patternIndex, index, { subTickOffset: nextOffset }, trackIndex);
    onFocusStepPad(index, instrumentIdToPadId(steps[index]?.instrumentId));
    onLatchMicroStep(index, nextOffset);
  };

  return (
    <div className="phrase-grid-scroll phrase-sequencer-list flex-1 min-h-0" aria-label="Vertical phrase steps">
      <div className="phrase-grid-header phrase-sequencer-grid" style={PHRASE_GRID_TEMPLATE}>
        <span>STEP</span>
        <span>SUB</span>
        <span>TBL</span>
        <span>NOTE</span>
        <span>INST / POLY</span>
        <span>VOL</span>
        <span>FX1</span>
        <span>FX2</span>
        <span>FX3</span>
        <span>COND</span>
      </div>
      {steps.slice(page * 16, page * 16 + 16).map((step, row) => {
        const index = page * 16 + row;
        const stackedPadIds = getStackedPadIds(step);
        const padId = stackedPadIds[0] ?? null;
        const isPolyStacked = stackedPadIds.length > 1;
        const active = padId !== null && step.note !== '---' && step.note !== 'OFF';
        const occupied = Boolean(step.instrumentId !== null || (step.note && step.note !== '---'));
        const isCurrent = activeStep === index;
        const isFocusedRow = focusedStepIndex === index;
        const isGrooveSubAccent = playing && isCurrent && groovePreset !== '8-8' && Boolean(delayedSteps[index % 16]);
        const fx1 = normalizeVoiceFx(step.fx);
        const fx2 = normalizeVoiceFx(step.fx2);
        const fx3 = normalizePunchFx3(step.fx3);
        const microOffset = clampSubtickOffset(step.subTickOffset);

        return (
          <div
            className={`phrase-row phrase-sequencer-grid ${isFocusedRow ? 'is-focused ring-1 ring-emerald-400/60' : ''} ${isCurrent ? 'is-playing' : ''} ${playing && isCurrent && delayedSteps[index % 16] ? 'is-groove-pulse' : ''} ${isGrooveSubAccent ? 'is-groove-subaccent border-rose-500/80 bg-rose-950/20' : ''}`}
            style={PHRASE_GRID_TEMPLATE}
            key={index}
            data-step={index + 1}
            data-poly-count={stackedPadIds.length}
            onClick={() => {
              if (padId) onFocusStepPad(index, padId);
            }}
          >
            <button type="button" aria-label={`Phrase step ${index + 1}`} aria-pressed={active}
              disabled={contextLock || (transportBusy && !occupied)}
              onClick={(event) => {
                event.stopPropagation();
                toggleStep(index);
              }}
              className={`phrase-step-toggle shrink-0 ${active ? 'is-active' : ''} ${isGrooveSubAccent ? 'text-rose-300 border-rose-500' : ''}`}>
              {stepNumber(index)}
            </button>
            <div className="phrase-microtiming-control flex items-center justify-between gap-0.5 min-w-0" aria-label={`Phrase subtick step ${index + 1}`}>
              <button type="button" className="px-1 shrink-0" aria-label={`Move step ${index + 1} earlier`} disabled={!padId}
                onClick={(event) => {
                  event.stopPropagation();
                  applyMicroOffset(index, microOffset - 1);
                }}>−</button>
              <button type="button" className="phrase-micro-zero px-1 tabular-nums min-w-0 truncate" aria-label={`Reset step ${index + 1} subtick to zero`} disabled={!padId}
                onClick={(event) => {
                  event.stopPropagation();
                  applyMicroOffset(index, 0);
                }}>
                {microOffset === 0 ? '0' : microOffset > 0 ? `+${microOffset}` : String(microOffset)}
              </button>
              <button type="button" className="px-1 shrink-0" aria-label={`Move step ${index + 1} later`} disabled={!padId}
                onClick={(event) => {
                  event.stopPropagation();
                  applyMicroOffset(index, microOffset + 1);
                }}>+</button>
            </div>
            <select aria-label={`Phrase table step ${index + 1}`} className={fieldClass}
              value={step.tableId ?? ''} disabled={!padId}
              data-filled={step.tableId !== null ? 'true' : undefined}
              onChange={(event) => projectController.updateStep(patternIndex, index, {
                tableId: event.target.value ? Number(event.target.value) : null,
              }, trackIndex)}>
              <option value="">---</option>
              {projectController.getTables(trackIndex).map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
            </select>
            <select aria-label={`Phrase note step ${index + 1}`} className={fieldClass} value={step.note || '---'}
              disabled={!padId} onChange={(event) => projectController.updateStep(patternIndex, index, { note: event.target.value }, trackIndex)}
              data-filled={step.note && step.note !== '---' ? 'true' : undefined}>
              <option value="---">---</option>
              {Array.from({ length: 72 }, (_, i) => noteName(i + 24)).map((note) => <option key={note} value={note}>{note}</option>)}
              <option value="OFF">OFF</option>
            </select>
            <div className="phrase-poly-inst-cell flex items-center gap-1 min-w-0" data-poly-stacked={isPolyStacked ? 'true' : undefined}>
              <select aria-label={`Phrase instrument step ${index + 1}`} className={`${fieldClass} flex-1 min-w-0`}
                value={padId ?? ''} disabled={transportBusy}
                data-filled={padId !== null ? 'true' : undefined}
                onChange={(event) => {
                  const nextPadId = event.target.value || null;
                  projectController.updateStep(patternIndex, index, {
                    instrumentId: nextPadId ? padIdToInstrumentId(nextPadId) : null,
                    note: nextPadId ? (step.note && step.note !== '---' ? step.note : 'C-4') : '---',
                  }, trackIndex);
                  onFocusStepPad(index, nextPadId);
                }}>
                <option value="">---</option>
                {pads.map((pad) => <option key={pad.id} value={pad.id}>{pad.id}</option>)}
              </select>
              {isPolyStacked && (
                <div className="phrase-poly-badges flex items-center gap-0.5 shrink-0" aria-label={`Stacked pads step ${index + 1}`}>
                  {stackedPadIds.map((stackPadId) => {
                    const isSelectedStackPad = focusedPadId === stackPadId && isFocusedRow;
                    return (
                      <button
                        key={stackPadId}
                        type="button"
                        aria-pressed={isSelectedStackPad}
                        aria-label={`Focus pad ${stackPadId} subticks on step ${index + 1}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onFocusStepPad(index, stackPadId);
                        }}
                        className={`px-1 py-0.5 text-[9px] font-bold border rounded ${
                          isSelectedStackPad
                            ? 'border-emerald-300 bg-emerald-950 text-emerald-200'
                            : 'border-cyan-500/60 bg-cyan-950/60 text-cyan-200'
                        }`}
                      >
                        {stackPadId}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <label className={`phrase-inline-volume flex items-center gap-1 min-w-0 ${occupied ? 'has-value' : ''}`}>
              <input aria-label={`Phrase volume step ${index + 1}`} type="range" min="0" max="127"
                className="w-full min-w-0"
                value={step.velocity ?? 127} disabled={!padId}
                onChange={(event) => projectController.updateStep(patternIndex, index, { velocity: Number(event.target.value) }, trackIndex)} />
              <span className="tabular-nums shrink-0">{step.velocity ?? 127}</span>
            </label>
            <select aria-label={`Phrase FX1 step ${index + 1}`} className={fieldClass}
              value={fx1} disabled={!padId}
              data-filled={fx1 !== 'OFF' ? 'true' : undefined}
              onChange={(event) => {
                const nextFx = normalizeVoiceFx(event.target.value);
                projectController.updateStep(patternIndex, index, {
                  fx: nextFx,
                  ...(nextFx === 'OFF' ? { fxValue: undefined } : { fxValue: step.fxValue ?? 64 }),
                }, trackIndex);
              }}>
              {VOICE_FX_OPTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <select aria-label={`Phrase FX2 step ${index + 1}`} className={fieldClass}
              value={fx2} disabled={!padId}
              data-filled={fx2 !== 'OFF' ? 'true' : undefined}
              onChange={(event) => {
                const nextFx2 = normalizeVoiceFx(event.target.value);
                projectController.updateStep(patternIndex, index, {
                  fx2: nextFx2,
                  ...(nextFx2 === 'OFF' ? { fx2Value: undefined } : { fx2Value: step.fx2Value ?? 64 }),
                }, trackIndex);
              }}>
              {VOICE_FX_OPTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <select aria-label={`Phrase FX3 step ${index + 1}`} className={fieldClass}
              value={fx3} disabled={!padId}
              data-filled={fx3 !== 'OFF' ? 'true' : undefined}
              onChange={(event) => {
                const nextFx3 = normalizePunchFx3(event.target.value);
                projectController.updateStep(patternIndex, index, {
                  fx3: nextFx3,
                  ...(nextFx3 === 'OFF' ? { fx3Value: undefined } : { fx3Value: step.fx3Value ?? 64 }),
                }, trackIndex);
              }}>
              {PUNCH_FX3_OPTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <select aria-label={`Phrase condition step ${index + 1}`} className={fieldClass}
              value={step.trig?.fillOnly ? 'FILL' : step.trig?.cycleCondition ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                projectController.updateStep(patternIndex, index, {
                  trig: value === 'FILL' ? { fillOnly: true } :
                    value ? { cycleCondition: value } : undefined,
                }, trackIndex);
              }}>
              <option value="">---</option><option value="FILL">FILL</option>
              <option value="1:2">1:2</option><option value="2:2">2:2</option>
              <option value="1:4">1:4</option><option value="2:4">2:4</option>
              <option value="3:4">3:4</option><option value="4:4">4:4</option>
            </select>
          </div>
        );
      })}
      <div className="phrase-page-controls flex flex-wrap items-center gap-1.5 mt-1">
        <button type="button" className={buttonClass} disabled={transportBusy || !firstLoadedPad}
          aria-expanded={euclideanOpen} onClick={() => setEuclideanOpen((open) => !open)}>EUCLID</button>
        {euclideanOpen && <form className="euclidean-controls flex items-center gap-1.5" onSubmit={(event) => {
          event.preventDefault();
          const currentPadId = instrumentIdToPadId(steps.find((step) => step.instrumentId !== null)?.instrumentId ?? null) ?? firstLoadedPad;
          if (!currentPadId) return;
          const hits = generateEuclideanSteps(euclideanSteps, euclideanHits, euclideanRotation);
          const instrumentId = padIdToInstrumentId(currentPadId);
          if (instrumentId === null) return;
          projectController.applyEuclideanPattern(patternIndex, trackIndex, hits, instrumentId);
          setEuclideanOpen(false);
        }}>
          <label>STEPS <input aria-label="Euclidean steps" type="number" min="1" max={pattern.length}
            value={euclideanSteps} onChange={(event) => {
              const next = Math.max(1, Math.min(pattern.length, Number(event.target.value)));
              setEuclideanSteps(next);
              setEuclideanHits((hits) => Math.min(hits, next));
            }} /></label>
          <label>HITS <input aria-label="Euclidean hits" type="number" min="0" max={euclideanSteps}
            value={euclideanHits} onChange={(event) => setEuclideanHits(Math.max(0, Math.min(euclideanSteps, Number(event.target.value))))} /></label>
          <label>ROT <input aria-label="Euclidean rotation" type="number" value={euclideanRotation}
            onChange={(event) => setEuclideanRotation(Number(event.target.value) || 0)} /></label>
          <button type="submit" className={buttonClass}>APPLY</button>
        </form>}
        {Array.from({ length: pageCount }, (_, index) => <button key={index} type="button"
          className={`${buttonClass} ${page === index ? 'border-cyan-400 text-cyan-300' : ''}`}
          aria-label={`Phrase page ${index + 1}${activeStep >= index * 16 && activeStep < (index + 1) * 16 ? ', playing' : ''}`}
          onClick={() => setPage(index)}>
          {stepNumber(index * 16)}-{stepNumber(index * 16 + 15)}
        </button>)}
        {transportBusy && <span className="text-amber-300">Stop to change instrument assignments.</span>}
      </div>
    </div>
  );
}

function TableRows({
  table,
  trackIndex,
  activeStep,
  activeSubtick,
  groovePreset,
  delayedSteps,
  paused,
  playing,
  tableWindow,
  focusedSubtickRange,
  onUpdateTableWindow,
}: {
  table: TrackerTable;
  trackIndex: number;
  activeStep: number;
  activeSubtick: number;
  groovePreset: GroovePreset;
  delayedSteps: boolean[];
  paused: boolean;
  playing: boolean;
  tableWindow: TableWindowState;
  focusedSubtickRange: { start: number; end: number } | null;
  onUpdateTableWindow: (updater: (prev: TableWindowState) => TableWindowState) => void;
}) {
  const [pitchSlidePopup, setPitchSlidePopup] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pageCount = Math.max(1, Math.ceil(table.steps.length / 16));
  const currentTick = activeStep < 0 || table.steps.length === 0 ? -1 : (activeStep * 8 + activeSubtick) % table.steps.length;
  const cursorPage = currentTick < 0 ? -1 : Math.floor(currentTick / 16);
  const page = tableWindow.followPlayhead && (playing || paused) && cursorPage >= 0
    ? Math.max(0, Math.min(pageCount - 1, cursorPage))
    : Math.max(0, Math.min(pageCount - 1, tableWindow.pageIndex));

  useEffect(() => {
    if (!tableWindow.followPlayhead || !(playing || paused) || currentTick < 0) return;
    onUpdateTableWindow((prev) => syncPlayheadToTableWindow(prev, currentTick, playing));
  }, [tableWindow.followPlayhead, playing, paused, currentTick, onUpdateTableWindow]);

  useEffect(() => {
    setPitchSlidePopup(null);
  }, [page]);

  const setOpcodeParamValue = (subtickIndex: number, fx: 'FL' | 'DL', rawValue: number) => {
    const clamped = Number.isFinite(rawValue)
      ? Math.max(0, Math.min(127, Math.round(rawValue)))
      : 64;
    projectController.updateTableStep(
      table.id,
      subtickIndex,
      { reset: false, fx, fxValue: clamped },
      trackIndex,
    );
  };

  const setSlideValue = (subtickIndex: number, rawSemitones: number) => {
    const next = Math.max(-24, Math.min(24, Math.round(rawSemitones)));
    projectController.updateTableStep(
      table.id,
      subtickIndex,
      { reset: false, fx: 'PS', fxValue: next },
      trackIndex,
    );
  };

  const applyQuickSpan = (startSubtickIndex: number, spanTicks: number, semitones: number) => {
    if (startSubtickIndex < 0 || startSubtickIndex >= table.steps.length) return;
    const clampedValue = Math.max(-24, Math.min(24, Math.round(semitones)));
    const safeSpan = Math.max(1, Math.min(64, Math.round(spanTicks)));
    const endExclusive = Math.min(table.steps.length, startSubtickIndex + safeSpan);
    for (let idx = startSubtickIndex; idx < endExclusive; idx++) {
      projectController.updateTableStep(
        table.id,
        idx,
        { reset: false, fx: 'PS', fxValue: clampedValue },
        trackIndex,
      );
    }
  };

  const updateSlideFromClientX = (subtickIndex: number, clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const semitones = Math.round((ratio * 2 - 1) * 24);
    setSlideValue(subtickIndex, semitones);
  };

  const toggleMagnifierForRow = (subtickIndex: number, buttonEl: HTMLElement) => {
    setPitchSlidePopup(null);
    onUpdateTableWindow((prev) => {
      if (prev.magnifier.isOpen && prev.magnifier.anchorTableStep === subtickIndex) {
        return closeMagnifier(prev);
      }
      const rect = buttonEl.getBoundingClientRect();
      const anchorRect: ViewportRect = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
      const viewport = {
        width: typeof window !== 'undefined' ? window.innerWidth : 1024,
        height: typeof window !== 'undefined' ? window.innerHeight : 768,
      };
      return openSubtickMagnifier(prev, subtickIndex, subtickIndex, anchorRect, viewport);
    });
  };

  const latched = tableWindow.latchedIndicator;

  return (
    <div
      className="table-grid-scroll table-sequencer-list relative flex-1 min-h-0"
      aria-label="Vertical table ticks"
    >
      <div className="table-page-controls flex flex-wrap items-center gap-2">
        <label className="control-block">PAGE <select aria-label="Table page" className={fieldClass}
          value={page} onChange={(event) => {
            const nextPage = Number(event.target.value);
            onUpdateTableWindow((prev) => setTablePage(prev, nextPage));
          }}>
          {Array.from({ length: pageCount }, (_, index) => <option key={index} value={index}>
            {index + 1} · {index * 16 + 1}-{Math.min((index + 1) * 16, table.steps.length)}
          </option>)}
        </select></label>
        <span className="text-zinc-400">SUBTICKS {page * 16 + 1}-{Math.min((page + 1) * 16, table.steps.length)}</span>
        {latched && (
          <span role="status" className="text-cyan-300">
            LATCHED PHR S{latched.phraseStepIndex + 1} ({latched.microOffset >= 0 ? `+${latched.microOffset}` : latched.microOffset}) -&gt; TBL {latched.latchedTableStep + 1}
          </span>
        )}
      </div>
      <div className="table-grid-header table-sequencer-grid" style={TABLE_GRID_TEMPLATE}>
        <span>SUB</span>
        <span>PITCH</span>
        <span>VOL</span>
        <span>FX1</span>
        <span>FX2</span>
        <span>FX3</span>
      </div>
      {table.steps.slice(page * 16, page * 16 + 16).map((step, row) => {
        const index = page * 16 + row;
        const current = (playing || paused) && index === currentTick;
        const isGrooveSubAccent = playing && current && groovePreset !== '8-8' && activeStep >= 0 && Boolean(delayedSteps[activeStep % 16]);
        const rawFx = step.reset ? 'OFF' : step.fx ?? 'OFF';
        const activeFx = normalizeVoiceFx(rawFx);
        const activeFx2 = normalizeVoiceFx(step.fx2);
        const activeFx3 = normalizePunchFx3(step.fx3);
        const opcodeValue = Math.max(0, Math.min(127, Math.round(step.fxValue ?? 64)));
        const fx2Value = Math.max(0, Math.min(127, Math.round(step.fx2Value ?? 64)));
        const fx3Value = Math.max(0, Math.min(127, Math.round(step.fx3Value ?? 64)));
        const slideValue = step.fxValue ?? 0;
        const formattedSlide = `${slideValue > 0 ? '+' : ''}${slideValue}`;
        const thumbPercent = ((slideValue + 24) / 48) * 100;
        const isOpen = pitchSlidePopup === index && activeFx === 'PS';
        const isLatchedRow = latched?.latchedTableStep === index;
        const isInFocused8Block =
          focusedSubtickRange !== null &&
          index >= focusedSubtickRange.start &&
          index <= focusedSubtickRange.end;
        const isMagnifierAnchor = tableWindow.magnifier.isOpen && tableWindow.magnifier.anchorTableStep === index;

        return (
          <div
            className={`table-row table-sequencer-grid relative ${isInFocused8Block ? 'is-focused-subtick-block bg-emerald-950/20 border-l-2 border-l-emerald-400' : ''} ${isOpen ? 'z-30' : ''} ${current ? 'is-playing' : ''} ${playing && current && activeStep >= 0 && delayedSteps[activeStep % 16] ? 'is-groove-pulse' : ''} ${isGrooveSubAccent ? 'is-groove-subaccent border-rose-500/80 bg-rose-950/20' : ''}`}
            style={{ ...TABLE_GRID_TEMPLATE, overflow: 'visible' }}
            key={index}
            data-subtick={index + 1}
            data-latched={isLatchedRow ? 'true' : undefined}
            data-focused-8={isInFocused8Block ? 'true' : undefined}
          >
            <div className="flex items-center gap-1 min-w-0">
              <span className={`table-step-address tabular-nums shrink-0 ${isGrooveSubAccent ? 'text-rose-300 border-rose-500' : ''}`} aria-label={`Table subtick ${index + 1}`}>
                {String(index + 1).padStart(3, '0')}
              </span>
              <button
                type="button"
                aria-label={`Magnify subticks around ${index + 1}`}
                aria-pressed={isMagnifierAnchor}
                className={`${buttonClass} px-1 py-0.5 text-[10px]`}
                onClick={(event) => toggleMagnifierForRow(index, event.currentTarget)}
              >
                MAG
              </button>
            </div>
            <select aria-label={`Table pitch subtick ${index + 1}`} className={fieldClass}
              value={step.pitch ?? ''} onChange={(event) => projectController.updateTableStep(table.id, index, {
                pitch: event.target.value === '' ? null : Number(event.target.value),
              }, trackIndex)}>
              <option value="">HOLD</option>
              {Array.from({ length: 49 }, (_, i) => i - 24).map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
            </select>
            <label className="flex items-center gap-1 min-w-0" aria-label={`Table volume subtick ${index + 1}`}>
              <input aria-label={`Table volume subtick ${index + 1}`} type="range" min="0" max="127" step="1"
                className="w-full min-w-0"
                value={step.volume ?? 127}
                onChange={(event) => projectController.updateTableStep(table.id, index, {
                  volume: Number(event.target.value),
                }, trackIndex)} />
              <button type="button" className="tabular-nums shrink-0" aria-label={`Set table volume subtick ${index + 1} to hold`}
                onClick={() => projectController.updateTableStep(table.id, index, { volume: null }, trackIndex)}>
                {step.volume ?? 'H'}
              </button>
            </label>
            <div
              className="table-fx-cell relative flex items-center gap-1 min-w-0"
              style={{ overflow: 'visible', position: 'relative' }}
            >
              <select aria-label={`Table FX1 subtick ${index + 1}`} className={`${fieldClass} flex-1 min-w-0`}
                value={activeFx} onChange={(event) => {
                  const fx = normalizeVoiceFx(event.target.value);
                  const defaultValue = fx === 'PS'
                    ? (step.fx === 'PS' ? (step.fxValue ?? 0) : 0)
                    : fx === 'FL' || fx === 'DL'
                      ? ((step.fx === 'FL' || step.fx === 'DL') && step.fxValue !== undefined ? opcodeValue : 64)
                      : undefined;
                  projectController.updateTableStep(table.id, index, {
                    reset: false,
                    fx,
                    fxValue: defaultValue,
                  }, trackIndex);
                  setPitchSlidePopup(fx === 'PS' ? index : null);
                }}>
                {VOICE_FX_OPTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
              {(activeFx === 'FL' || activeFx === 'DL') && (
                <>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`Decrease ${activeFx === 'FL' ? 'filter' : 'delay'} value subtick ${index + 1}`}
                    onClick={() => setOpcodeParamValue(index, activeFx, opcodeValue - 8)}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={127}
                    step={1}
                    aria-label={`${activeFx === 'FL' ? 'Filter' : 'Delay'} value subtick ${index + 1}`}
                    className={`${fieldClass} w-12 tabular-nums`}
                    value={opcodeValue}
                    onChange={(event) => setOpcodeParamValue(index, activeFx, Number(event.target.value))}
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`Increase ${activeFx === 'FL' ? 'filter' : 'delay'} value subtick ${index + 1}`}
                    onClick={() => setOpcodeParamValue(index, activeFx, opcodeValue + 8)}
                  >
                    +
                  </button>
                </>
              )}
              {activeFx === 'PS' && (
                <button type="button" className="table-pitch-slide-button px-1.5 py-0.5 border-2 border-cyan-400 bg-cyan-950 text-cyan-200 text-[10px] font-bold shrink-0"
                  aria-label={`Edit pitch slide subtick ${index + 1}`}
                  aria-expanded={isOpen}
                  onClick={() => setPitchSlidePopup((open) => open === index ? null : index)}>
                  {formattedSlide}
                </button>
              )}
              {isOpen && (
                <div
                  className="table-pitch-slide-popup absolute left-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-1 p-1 border-2 border-cyan-400 bg-zinc-950 shadow-xl w-max max-w-[360px]"
                  role="dialog"
                  aria-label={`Pitch slide subtick ${index + 1}`}
                >
                  <button type="button" aria-label={`Decrease pitch slide subtick ${index + 1}`}
                    className="w-6 h-7 border border-cyan-500/70 bg-zinc-900 text-cyan-200 font-black shrink-0"
                    onClick={() => setSlideValue(index, slideValue - 1)}>-</button>
                  <div
                    ref={trackRef}
                    role="slider"
                    tabIndex={0}
                    aria-label={`Pitch slide semitones subtick ${index + 1}`}
                    aria-valuemin={-24}
                    aria-valuemax={24}
                    aria-valuenow={slideValue}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      updateSlideFromClientX(index, event.clientX);
                    }}
                    onPointerMove={(event) => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      updateSlideFromClientX(index, event.clientX);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        setSlideValue(index, slideValue - 1);
                      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        setSlideValue(index, slideValue + 1);
                      }
                    }}
                    className="relative flex-1 min-w-[60px] h-7 border border-zinc-600 bg-zinc-900 touch-none select-none cursor-ew-resize overflow-hidden"
                  >
                    <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-zinc-500/80" aria-hidden="true" />
                    <div
                      className="absolute inset-y-0.5 w-3 -translate-x-1/2 border border-cyan-200 bg-cyan-400"
                      style={{ left: `${thumbPercent}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <button type="button" aria-label={`Increase pitch slide subtick ${index + 1}`}
                    className="w-6 h-7 border border-cyan-500/70 bg-zinc-900 text-cyan-200 font-black shrink-0"
                    onClick={() => setSlideValue(index, slideValue + 1)}>+</button>
                  {QUICK_SPANS.map((spanTicks) => (
                    <button
                      key={spanTicks}
                      type="button"
                      aria-label={`Apply pitch slide across ${spanTicks} subticks starting at subtick ${index + 1}`}
                      title={`Start at subtick ${index + 1} for ${spanTicks} ticks (${formattedSlide} ST)`}
                      className="px-1 h-7 border border-amber-500/60 bg-zinc-900 text-amber-200 text-[9px] font-bold shrink-0"
                      onClick={() => applyQuickSpan(index, spanTicks, slideValue)}
                    >
                      {spanTicks}T
                    </button>
                  ))}
                  <span className="px-1 text-[10px] font-bold text-cyan-200 shrink-0">{formattedSlide}</span>
                  <button type="button" aria-label="Close pitch slide scrubber"
                    className="w-5 h-7 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[10px] shrink-0"
                    onClick={() => setPitchSlidePopup(null)}>×</button>
                </div>
              )}
            </div>
            <div className="table-fx2-cell flex items-center gap-1 min-w-0">
              <select aria-label={`Table FX2 subtick ${index + 1}`} className={`${fieldClass} w-full`}
                value={activeFx2}
                onChange={(event) => {
                  const nextFx2 = normalizeVoiceFx(event.target.value);
                  projectController.updateTableStep(table.id, index, {
                    fx2: nextFx2,
                    fx2Value: nextFx2 === 'OFF' ? undefined : fx2Value,
                  }, trackIndex);
                }}>
                {VOICE_FX_OPTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="table-fx3-cell flex items-center gap-1 min-w-0">
              <select aria-label={`Table FX3 subtick ${index + 1}`} className={`${fieldClass} w-full`}
                value={activeFx3}
                onChange={(event) => {
                  const nextFx3 = normalizePunchFx3(event.target.value);
                  projectController.updateTableStep(table.id, index, {
                    fx3: nextFx3,
                    fx3Value: nextFx3 === 'OFF' ? undefined : fx3Value,
                  }, trackIndex);
                }}>
                {PUNCH_FX3_OPTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
          </div>
        );
      })}
      {tableWindow.magnifier.isOpen && tableWindow.magnifier.anchorTableStep !== null && (() => {
        const anchorStep = tableWindow.magnifier.anchorTableStep;
        return (
          <div
            role="dialog"
            aria-label="Subtick magnifier"
            className="subtick-magnifier-popover fixed z-50 bg-zinc-950 border border-cyan-400 p-2 shadow-xl"
            style={{
              top: `${Math.round(tableWindow.magnifier.position.top)}px`,
              left: `${Math.round(tableWindow.magnifier.position.left)}px`,
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-cyan-300">
                SUBTICK MAGNIFIER ({anchorStep + 1})
              </span>
              <button
                type="button"
                aria-label="Close subtick magnifier"
                className={buttonClass}
                onClick={() => onUpdateTableWindow((prev) => closeMagnifier(prev))}
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {tableWindow.magnifier.visibleSubticks.map((subtickIdx) => {
                const rowItem = table.steps[subtickIdx];
                const isCenter = subtickIdx === anchorStep;
                return (
                  <button
                    key={subtickIdx}
                    type="button"
                    aria-label={`Select subtick ${subtickIdx + 1}`}
                    className={`${buttonClass} ${isCenter ? 'border-cyan-400 text-cyan-300' : ''}`}
                    onClick={() => {
                      const targetPage = Math.floor(subtickIdx / 16);
                      onUpdateTableWindow((prev) =>
                        closeMagnifier(setTablePage(prev, targetPage)),
                      );
                    }}
                  >
                    {String(subtickIdx + 1).padStart(3, '0')}:{rowItem?.fx && rowItem.fx !== 'OFF' ? rowItem.fx : rowItem?.pitch ?? '—'}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}