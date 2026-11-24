import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  projectController,
  type Pattern,
  type PhraseLength,
  type PunchInFx3Code,
  type TrackerTable,
  type VoiceSubtickFxCode,
} from '../project/projectController';
import type { PadSlot } from '../sampler/usePadBank';
import { getGrooveDelayedSteps, type GroovePreset } from './groovePresets';
import { instrumentIdToPadId, padIdToInstrumentId } from '../sampler/padIds';
import { generateEuclideanSteps } from './euclideanGenerator';

const fieldClass = 'phrase-cell-control bg-zinc-950 border border-zinc-700 text-zinc-100';
const buttonClass = 'border border-zinc-700 px-2 py-1 text-zinc-300';
const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = (midi: number) => `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;
const stepNumber = (stepIndex: number) => String(stepIndex + 1).padStart(2, '0');
const QUICK_SPANS = [2, 4, 8, 16, 32, 64] as const;
const VOICE_FX_OPTIONS: readonly VoiceSubtickFxCode[] = ['OFF', 'FL', 'DL', 'PS'];
const PUNCH_FX3_OPTIONS: readonly PunchInFx3Code[] = ['OFF', 'PM', 'LF', 'BC'];

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
}

function normalizeVoiceFx(raw: unknown): VoiceSubtickFxCode {
  if (typeof raw !== 'string') return 'OFF';
  const upper = raw.toUpperCase();
  if (upper === 'FL' || upper === 'DL' || upper === 'PS') return upper;
  return 'OFF';
}

function normalizePunchFx3(raw: unknown): PunchInFx3Code {
  if (typeof raw !== 'string') return 'OFF';
  const upper = raw.toUpperCase();
  if (upper === 'PM' || upper === 'LF' || upper === 'BC') return upper;
  return 'OFF';
}

function clampSubtickOffset(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(-8, Math.min(8, Math.round(raw)));
}

export function PhraseTableEditor({
  slots, activeStep, activeSubtick, groovePreset, transportPlaying, transportPaused, transportBusy, mode, queuedPatternIndex, onSelectPattern,
  linkedPad, contextLock = false, onToggleContextLock,
}: EditorProps) {
  const [tableId, setTableId] = useState<number | null>(null);
  const [trackIndex, setTrackIndex] = useState(() => projectController.getSelectedTrackIndex());
  useEffect(() => projectController.subscribe(() => {
    setTrackIndex(projectController.getSelectedTrackIndex());
  }), []);
  const state = projectController.getState();
  const patternIndex = state.settings.activePatternIndex;
  const pattern = state.tracker.patterns[patternIndex];
  const tables = projectController.getTables(trackIndex);
  const table = tables.find((item) => item.id === tableId) ?? tables[0];
  const delayedSteps = useMemo(() => getGrooveDelayedSteps(groovePreset), [groovePreset]);
  if (!pattern) return <p role="alert">Active phrase is unavailable.</p>;

  return (
    <section className={`${mode === 'phrase' ? 'phrase-panel' : 'table-panel'} relative flex-1 min-h-0 flex flex-col gap-2 p-3 bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl font-mono text-xs overflow-visible`}>
      <div className="phrase-toolbar flex items-center gap-2">
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
          </>
        ) : (
          <>
            <label className="control-block">TBL <select aria-label="Active table" className={fieldClass} value={table?.id ?? ''}
              onChange={(event) => setTableId(Number(event.target.value))}>
              {!table && <option value="">NONE</option>}
              {tables.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <button type="button" aria-label="New table" className={buttonClass}
              onClick={() => setTableId(projectController.createTable(trackIndex))}>＋</button>
            <button type="button" className={buttonClass} aria-label="Toggle table context lock"
              aria-pressed={contextLock} disabled={!linkedPad} onClick={onToggleContextLock}>
              {contextLock ? 'PAD LOCK' : 'LINK PAD'}
            </button>
            {linkedPad && <span role="status" className="text-cyan-300">
              {linkedPad.padId} · {linkedPad.name} · {linkedPad.playMode.toUpperCase()}
              {linkedPad.sliActive ? ` · SLI ${linkedPad.sliceMarkers?.length ?? 0}` : ''}
              {contextLock ? ' · PINNED' : ''}
            </span>}
          </>
        )}
      </div>
      {mode === 'phrase'
        ? <PhraseRows key={`${pattern.id}-${trackIndex}-${pattern.length}`} pattern={pattern} patternIndex={patternIndex}
            trackIndex={trackIndex} slots={slots} activeStep={activeStep} groovePreset={groovePreset}
            playing={transportPlaying} delayedSteps={delayedSteps} transportBusy={transportBusy} contextLock={contextLock} />
        : table
          ? <TableRows key={`${table.id}-${trackIndex}`} table={table} trackIndex={trackIndex}
              activeStep={activeStep} activeSubtick={activeSubtick} groovePreset={groovePreset} delayedSteps={delayedSteps}
              paused={transportPaused} playing={transportPlaying} />
          : <p className="text-zinc-400">Create a reusable table, then assign it to a phrase step.</p>}
    </section>
  );
}

function PhraseRows({ pattern, patternIndex, trackIndex, slots, activeStep, groovePreset, playing, delayedSteps, transportBusy, contextLock }: {
  pattern: Pattern; patternIndex: number; trackIndex: number; slots: Record<string, PadSlot>; activeStep: number;
  groovePreset: GroovePreset; playing: boolean; delayedSteps: boolean[]; transportBusy: boolean; contextLock: boolean;
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
    } else {
      const padId = instrumentIdToPadId(step?.instrumentId) ?? firstLoadedPad;
      if (!padId) return;
      projectController.updateStep(patternIndex, index, {
        instrumentId: padIdToInstrumentId(padId),
        note: 'C-4',
        velocity: step?.velocity ?? 127,
      }, trackIndex);
    }
  };

  return (
    <div className="phrase-grid-scroll phrase-sequencer-list flex-1 min-h-0" aria-label="Vertical phrase steps">
      <div className="phrase-grid-header phrase-sequencer-grid">
        <span>STEP</span><span>MICRO</span><span>TBL</span><span>NOTE</span><span>INST</span><span>VOL</span><span>FX1</span><span>FX2</span><span>FX3</span><span>COND</span>
      </div>
      {steps.slice(page * 16, page * 16 + 16).map((step, row) => {
        const index = page * 16 + row;
        const padId = instrumentIdToPadId(step.instrumentId);
        const active = padId !== null && step.note !== '---' && step.note !== 'OFF';
        const occupied = Boolean(step.instrumentId !== null || (step.note && step.note !== '---'));
        const isCurrent = activeStep === index;
        const isGrooveSubAccent = playing && isCurrent && groovePreset !== '8-8' && Boolean(delayedSteps[index % 16]);
        const fx1 = normalizeVoiceFx(step.fx);
        const fx2 = normalizeVoiceFx(step.fx2);
        const fx3 = normalizePunchFx3(step.fx3);
        const microOffset = clampSubtickOffset(step.subTickOffset);

        return (
          <div className={`phrase-row phrase-sequencer-grid ${isCurrent ? 'is-playing' : ''} ${playing && isCurrent && delayedSteps[index % 16] ? 'is-groove-pulse' : ''} ${isGrooveSubAccent ? 'is-groove-subaccent border-rose-500/80 bg-rose-950/20' : ''}`}
            key={index} data-step={index + 1}>
            <button type="button" aria-label={`Phrase step ${index + 1}`} aria-pressed={active}
              disabled={contextLock || (transportBusy && !occupied)}
              onClick={() => toggleStep(index)}
              className={`phrase-step-toggle ${active ? 'is-active' : ''} ${isGrooveSubAccent ? 'text-rose-300 border-rose-500' : ''}`}>
              {stepNumber(index)}
            </button>
            <div className="phrase-microtiming-control" aria-label={`Phrase microtiming step ${index + 1}`}>
              <button type="button" aria-label={`Move step ${index + 1} earlier`} disabled={!padId}
                onClick={() => projectController.updateStep(patternIndex, index, {
                  subTickOffset: clampSubtickOffset(microOffset - 1),
                }, trackIndex)}>−</button>
              <button type="button" className="phrase-micro-zero" aria-label={`Reset step ${index + 1} microtiming to zero`} disabled={!padId}
                onClick={() => projectController.updateStep(patternIndex, index, { subTickOffset: 0 }, trackIndex)}>
                {microOffset === 0 ? '0' : microOffset > 0 ? `+${microOffset}` : String(microOffset)}
              </button>
              <button type="button" aria-label={`Move step ${index + 1} later`} disabled={!padId}
                onClick={() => projectController.updateStep(patternIndex, index, {
                  subTickOffset: clampSubtickOffset(microOffset + 1),
                }, trackIndex)}>+</button>
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
            <select aria-label={`Phrase instrument step ${index + 1}`} className={fieldClass}
              value={padId ?? ''} disabled={transportBusy}
              data-filled={padId !== null ? 'true' : undefined}
              onChange={(event) => projectController.updateStep(patternIndex, index, {
                instrumentId: event.target.value ? padIdToInstrumentId(event.target.value) : null,
                note: event.target.value ? (step.note && step.note !== '---' ? step.note : 'C-4') : '---',
              }, trackIndex)}>
              <option value="">---</option>
              {pads.map((pad) => <option key={pad.id} value={pad.id}>{pad.id}</option>)}
            </select>
            <label className={`phrase-inline-volume ${occupied ? 'has-value' : ''}`}>
              <input aria-label={`Phrase volume step ${index + 1}`} type="range" min="0" max="127"
                value={step.velocity ?? 127} disabled={!padId}
                onChange={(event) => projectController.updateStep(patternIndex, index, { velocity: Number(event.target.value) }, trackIndex)} />
              <span>{step.velocity ?? 127}</span>
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
      <div className="phrase-page-controls">
        <button type="button" className={buttonClass} disabled={transportBusy || !firstLoadedPad}
          aria-expanded={euclideanOpen} onClick={() => setEuclideanOpen((open) => !open)}>EUCLID</button>
        {euclideanOpen && <form className="euclidean-controls" onSubmit={(event) => {
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

function TableRows({ table, trackIndex, activeStep, activeSubtick, groovePreset, delayedSteps, paused, playing }: {
  table: TrackerTable; trackIndex: number; activeStep: number; activeSubtick: number; groovePreset: GroovePreset;
  delayedSteps: boolean[]; paused: boolean; playing: boolean;
}) {
  const [page, setPage] = useState(0);
  const [pitchSlidePopup, setPitchSlidePopup] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pageCount = Math.ceil(table.steps.length / 16);
  const currentTick = activeStep < 0 || table.steps.length === 0 ? -1 : (activeStep * 8 + activeSubtick) % table.steps.length;
  const cursorPage = currentTick < 0 ? -1 : Math.floor(currentTick / 16);

  useEffect(() => {
    if ((playing || paused) && cursorPage >= 0) setPage(cursorPage);
  }, [cursorPage, paused, playing]);
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

  return (
    <div
      className="table-grid-scroll table-sequencer-list flex-1 min-h-0"
      aria-label="Vertical table ticks"
    >
      <div className="table-page-controls">
        <label className="control-block">PAGE <select aria-label="Table page" className={fieldClass}
          value={page} onChange={(event) => setPage(Number(event.target.value))}>
          {Array.from({ length: pageCount }, (_, index) => <option key={index} value={index}>
            {index + 1} · {index * 16 + 1}-{Math.min((index + 1) * 16, table.steps.length)}
          </option>)}
        </select></label>
        <span className="text-zinc-400">SUBTICKS {page * 16 + 1}-{Math.min((page + 1) * 16, table.steps.length)}</span>
      </div>
      <div className="table-grid-header table-sequencer-grid">
        <span>SUBTICK</span><span>PITCH</span><span>VOL</span><span>FX1</span><span>FX2</span><span>FX3</span>
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
        return (
          <div
            className={`table-row table-sequencer-grid relative ${isOpen ? 'z-30' : ''} ${current ? 'is-playing' : ''} ${playing && current && activeStep >= 0 && delayedSteps[activeStep % 16] ? 'is-groove-pulse' : ''} ${isGrooveSubAccent ? 'is-groove-subaccent border-rose-500/80 bg-rose-950/20' : ''}`}
            key={index}
            data-subtick={index + 1}
            style={{ overflow: 'visible' }}
          >
            <span className={`table-step-address ${isGrooveSubAccent ? 'text-rose-300 border-rose-500' : ''}`} aria-label={`Table subtick ${index + 1}`}>
              {String(index + 1).padStart(3, '0')}
            </span>
            <select aria-label={`Table pitch subtick ${index + 1}`} className={fieldClass}
              value={step.pitch ?? ''} onChange={(event) => projectController.updateTableStep(table.id, index, {
                pitch: event.target.value === '' ? null : Number(event.target.value),
              }, trackIndex)}>
              <option value="">HOLD</option>
              {Array.from({ length: 49 }, (_, i) => i - 24).map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
            </select>
            <label className="flex items-center gap-1" aria-label={`Table volume subtick ${index + 1}`}>
              <input aria-label={`Table volume subtick ${index + 1}`} type="range" min="0" max="127" step="1"
                value={step.volume ?? 127}
                onChange={(event) => projectController.updateTableStep(table.id, index, {
                  volume: Number(event.target.value),
                }, trackIndex)} />
              <button type="button" aria-label={`Set table volume subtick ${index + 1} to hold`}
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
                    className={`${fieldClass} w-12`}
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
              <select aria-label={`Table FX2 subtick ${index + 1}`} className={fieldClass}
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
              <select aria-label={`Table FX3 subtick ${index + 1}`} className={fieldClass}
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
    </div>
  );
}