import React, { useEffect, useMemo, useState } from 'react';
import { projectController, type Pattern, type PhraseLength, type TrackerTable } from '../project/projectController';
import type { PadSlot } from '../sampler/usePadBank';
import { getGrooveDelayedSteps, type GroovePreset } from './groovePresets';
import { instrumentIdToPadId, padIdToInstrumentId } from '../sampler/padIds';
import { generateEuclideanSteps } from './euclideanGenerator';

const fieldClass = 'phrase-cell-control bg-zinc-950 border border-zinc-700 text-zinc-100';
const buttonClass = 'border border-zinc-700 px-2 py-1 text-zinc-300';
const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = (midi: number) => `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;
const stepNumber = (stepIndex: number) => String(stepIndex + 1).padStart(2, '0');

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
    <section className={`${mode === 'phrase' ? 'phrase-panel' : 'table-panel'} relative flex-1 min-h-0 flex flex-col gap-2 p-3 bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl font-mono text-xs`}>
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
            trackIndex={trackIndex} slots={slots} activeStep={activeStep}
            playing={transportPlaying} delayedSteps={delayedSteps} transportBusy={transportBusy} contextLock={contextLock} />
        : table
          ? <TableRows key={`${table.id}-${trackIndex}`} table={table} trackIndex={trackIndex}
              activeStep={activeStep} activeSubtick={activeSubtick} delayedSteps={delayedSteps}
              paused={transportPaused} playing={transportPlaying} />
          : <p className="text-zinc-400">Create a reusable table, then assign it to a phrase step.</p>}
    </section>
  );
}

function PhraseRows({ pattern, patternIndex, trackIndex, slots, activeStep, playing, delayedSteps, transportBusy, contextLock }: {
  pattern: Pattern; patternIndex: number; trackIndex: number; slots: Record<string, PadSlot>; activeStep: number;
  playing: boolean; delayedSteps: boolean[]; transportBusy: boolean; contextLock: boolean;
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
        <span>STEP</span><span>NOTE</span><span>INST</span><span>VOL</span><span>FX</span><span>TBL</span><span>COND</span>
      </div>
      {steps.slice(page * 16, page * 16 + 16).map((step, row) => {
        const index = page * 16 + row;
        const padId = instrumentIdToPadId(step.instrumentId);
        const active = padId !== null && step.note !== '---' && step.note !== 'OFF';
        const occupied = Boolean(step.instrumentId !== null || (step.note && step.note !== '---'));
        return (
          <div className={`phrase-row phrase-sequencer-grid ${activeStep === index ? 'is-playing' : ''} ${playing && activeStep === index && delayedSteps[index % 16] ? 'is-groove-pulse' : ''}`}
            key={index} data-step={index + 1}>
            <button type="button" aria-label={`Phrase step ${index + 1}`} aria-pressed={active}
              disabled={contextLock || (transportBusy && !occupied)}
              onClick={() => toggleStep(index)}
              className={`phrase-step-toggle ${active ? 'is-active' : ''}`}>
              {stepNumber(index)}
            </button>
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
            <select aria-label={`Phrase FX step ${index + 1}`} className={fieldClass}
              value={step.fx ?? 'OFF'} disabled={!padId}
              data-filled={step.fx !== 'OFF' ? 'true' : undefined}
              onChange={(event) => projectController.updateStep(patternIndex, index, { fx: event.target.value }, trackIndex)}>
              <option value="OFF">OFF</option><option value="FL">FL</option><option value="DR">DR</option><option value="DL">DL</option>
            </select>
            <select aria-label={`Phrase table step ${index + 1}`} className={fieldClass}
              value={step.tableId ?? ''} disabled={!padId}
              data-filled={step.tableId !== null ? 'true' : undefined}
              onChange={(event) => projectController.updateStep(patternIndex, index, {
                tableId: event.target.value ? Number(event.target.value) : null,
              }, trackIndex)}>
              <option value="">---</option>
              {projectController.getTables(trackIndex).map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
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

function TableRows({ table, trackIndex, activeStep, activeSubtick, delayedSteps, paused, playing }: {
  table: TrackerTable; trackIndex: number; activeStep: number; activeSubtick: number; delayedSteps: boolean[]; paused: boolean; playing: boolean;
}) {
  const [page, setPage] = useState(0);
  const [pitchSlidePopup, setPitchSlidePopup] = useState<number | null>(null);
  const pageCount = Math.ceil(table.steps.length / 16);
  const currentTick = activeStep < 0 || table.steps.length === 0 ? -1 : (activeStep * 8 + activeSubtick) % table.steps.length;
  const cursorPage = currentTick < 0 ? -1 : Math.floor(currentTick / 16);

  useEffect(() => {
    if ((playing || paused) && cursorPage >= 0) setPage(cursorPage);
  }, [cursorPage, paused, playing]);
  useEffect(() => {
    setPitchSlidePopup(null);
  }, [page]);

  return (
    <div className="table-grid-scroll table-sequencer-list flex-1 min-h-0" aria-label="Vertical table ticks">
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
        <span>SUBTICK</span><span>PITCH</span><span>VOL</span><span>FX</span><span>MICRO-TIMING</span>
      </div>
      {table.steps.slice(page * 16, page * 16 + 16).map((step, row) => {
        const index = page * 16 + row;
        const current = (playing || paused) && index === currentTick;
        return (
          <div className={`table-row table-sequencer-grid ${current ? 'is-playing' : ''} ${playing && current && delayedSteps[activeStep % 16] ? 'is-groove-pulse' : ''}`}
            key={index} data-subtick={index + 1}>
            <span className="table-step-address" aria-label={`Table subtick ${index + 1}`}>
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
            <div className="table-fx-cell relative">
              <select aria-label={`Table FX subtick ${index + 1}`} className={`${fieldClass} w-full`}
                value={step.reset ? 'OFF' : step.fx ?? 'OFF'} onChange={(event) => {
                  const fx = event.target.value as 'FL' | 'DL' | 'DR' | 'PS' | 'OFF';
                  projectController.updateTableStep(table.id, index, {
                    reset: false,
                    fx,
                    fxValue: fx === 'PS' ? (step.fxValue ?? 0) : undefined,
                  }, trackIndex);
                  setPitchSlidePopup(fx === 'PS' ? index : null);
                }}>
                <option value="OFF">OFF</option><option value="FL">FL</option><option value="DR">DR</option><option value="DL">DL</option><option value="PS">PS</option>
              </select>
              {step.fx === 'PS' && step.reset !== true && (
                <button type="button" className="table-pitch-slide-button" aria-label={`Edit pitch slide subtick ${index + 1}`}
                  aria-expanded={pitchSlidePopup === index} onClick={() => setPitchSlidePopup((open) => open === index ? null : index)}>
                  {(step.fxValue ?? 0) > 0 ? '+' : ''}{step.fxValue ?? 0}
                </button>
              )}
              {pitchSlidePopup === index && step.fx === 'PS' && (
                <div className="table-pitch-slide-popup" role="dialog" aria-label={`Pitch slide subtick ${index + 1}`}>
                  <button type="button" aria-label="Close pitch slide scrubber" onClick={() => setPitchSlidePopup(null)}>×</button>
                  <input aria-label={`Pitch slide semitones subtick ${index + 1}`} type="range" min="-24" max="24" step="1"
                    value={step.fxValue ?? 0} onChange={(event) => {
                      const next = Math.max(-24, Math.min(24, Math.round(Number(event.target.value))));
                      projectController.updateTableStep(table.id, index, { fx: 'PS', fxValue: next }, trackIndex);
                    }} />
                  <output>{(step.fxValue ?? 0) > 0 ? '+' : ''}{step.fxValue ?? 0} ST</output>
                </div>
              )}
            </div>
            <div className="table-microtiming-control" aria-label={`Table microtiming subtick ${index + 1}`}>
              <button type="button" aria-label={`Move subtick ${index + 1} earlier`}
                onClick={() => projectController.updateTableStep(table.id, index, {
                  subTickOffset: Math.max(-8, (step.subTickOffset ?? 0) - 1),
                }, trackIndex)}>−</button>
              <button type="button" className="table-micro-zero" aria-label={`Reset subtick ${index + 1} to zero`}
                onClick={() => projectController.updateTableStep(table.id, index, { subTickOffset: 0 }, trackIndex)}>
                {(step.subTickOffset ?? 0) === 0 ? '0' : (step.subTickOffset ?? 0) > 0 ? `+${step.subTickOffset}` : String(step.subTickOffset)}
              </button>
              <button type="button" aria-label={`Move subtick ${index + 1} later`}
                onClick={() => projectController.updateTableStep(table.id, index, {
                  subTickOffset: Math.min(8, (step.subTickOffset ?? 0) + 1),
                }, trackIndex)}>+</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}