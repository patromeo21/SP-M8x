import React, { useEffect, useState } from 'react';
import { projectController, type Pattern, type PhraseLength, type TrackerTable } from '../project/projectController';
import type { PadSlot } from '../sampler/usePadBank';
import { trackerBridge } from './trackerBridge';
import { instrumentIdToPadId, padIdToInstrumentId } from '../sampler/padIds';

const fieldClass = 'phrase-cell-control bg-zinc-950 border border-zinc-700 text-zinc-100';
const buttonClass = 'border border-zinc-700 px-2 py-1 text-zinc-300';
const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = (midi: number) => `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;
const hexStep = (step: number) => step.toString(16).toUpperCase().padStart(2, '0');

interface EditorProps {
  slots: Record<string, PadSlot>;
  activeStep: number;
  transportBusy: boolean;
  mode: 'phrase' | 'table';
  queuedPatternIndex: number | null;
  onSelectPattern: (index: number) => void;
}

export function PhraseTableEditor({ slots, activeStep, transportBusy, mode, queuedPatternIndex, onSelectPattern }: EditorProps) {
  const [tableId, setTableId] = useState<number | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const state = projectController.getState();
  const patternIndex = state.settings.activePatternIndex;
  const pattern = state.tracker.patterns[patternIndex];
  const tables = projectController.getTables();
  const table = tables.find((item) => item.id === tableId) ?? tables[0];
  if (!pattern) return <p role="alert">Active phrase is unavailable.</p>;

  return (
    <section className={`${mode === 'phrase' ? 'phrase-panel' : 'table-panel'} flex-1 min-h-0 flex flex-col gap-2 p-3 bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl font-mono text-xs`}>
      <div className="phrase-toolbar flex items-center gap-2">
        <label className="control-block">TRK <select aria-label="Phrase track" className={fieldClass} value={trackIndex}
          onChange={(event) => setTrackIndex(Number(event.target.value))}>
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
            <button type="button" aria-label="New table" className={buttonClass} onClick={() => setTableId(projectController.createTable())}>＋</button>
          </>
        )}
      </div>
      {mode === 'phrase'
        ? <PhraseRows key={`${pattern.id}-${trackIndex}-${pattern.length}`} pattern={pattern} patternIndex={patternIndex}
            trackIndex={trackIndex} slots={slots} activeStep={activeStep} transportBusy={transportBusy} />
        : table
          ? <TableRows key={table.id} table={table} playing={activeStep >= 0} />
          : <p className="text-zinc-400">Create a reusable table, then assign it to a phrase step.</p>}
    </section>
  );
}

function PhraseRows({ pattern, patternIndex, trackIndex, slots, activeStep, transportBusy }: {
  pattern: Pattern; patternIndex: number; trackIndex: number; slots: Record<string, PadSlot>; activeStep: number; transportBusy: boolean;
}) {
  const [page, setPage] = useState(0);
  const steps = pattern.tracks[trackIndex].steps;
  const firstLoadedPad = Object.values(slots).find((slot) => slot.sampleKey)?.id;
  const pads = Object.values(slots).filter((slot) => slot.sampleKey);
  const pageCount = pattern.length / 16;

  const toggleStep = (index: number) => {
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
        <span>STEP</span><span>NOTE</span><span>INST</span><span>VOL</span><span>FX</span><span>TBL</span>
      </div>
      {steps.slice(page * 16, page * 16 + 16).map((step, row) => {
        const index = page * 16 + row;
        const padId = instrumentIdToPadId(step.instrumentId);
        const active = padId !== null && step.note !== '---' && step.note !== 'OFF';
        const occupied = Boolean(step.instrumentId !== null || (step.note && step.note !== '---'));
        return (
          <div className={`phrase-row phrase-sequencer-grid ${activeStep === index ? 'is-playing' : ''}`}
            key={index} data-step={hexStep(index)}>
            <button type="button" aria-label={`Phrase step ${index + 1}`} aria-pressed={active}
              disabled={transportBusy && !occupied}
              onClick={() => toggleStep(index)}
              className={`phrase-step-toggle ${active ? 'is-active' : ''}`}>
              {hexStep(index)}
            </button>
            <select aria-label={`Phrase note step ${index + 1}`} className={fieldClass} value={step.note || '---'}
              disabled={!padId} onChange={(event) => projectController.updateStep(patternIndex, index, { note: event.target.value }, trackIndex)}>
              <option value="---">---</option>
              {Array.from({ length: 72 }, (_, i) => noteName(i + 24)).map((note) => <option key={note} value={note}>{note}</option>)}
              <option value="OFF">OFF</option>
            </select>
            <select aria-label={`Phrase instrument step ${index + 1}`} className={fieldClass}
              value={padId ?? ''} disabled={transportBusy}
              onChange={(event) => projectController.updateStep(patternIndex, index, {
                instrumentId: event.target.value ? padIdToInstrumentId(event.target.value) : null,
                note: event.target.value ? (step.note && step.note !== '---' ? step.note : 'C-4') : '---',
              }, trackIndex)}>
              <option value="">---</option>
              {pads.map((pad) => <option key={pad.id} value={pad.id}>{pad.id}</option>)}
            </select>
            <label className="phrase-inline-volume">
              <input aria-label={`Phrase volume step ${index + 1}`} type="range" min="0" max="127"
                value={step.velocity ?? 127} disabled={!padId}
                onChange={(event) => projectController.updateStep(patternIndex, index, { velocity: Number(event.target.value) }, trackIndex)} />
              <span>{step.velocity ?? 127}</span>
            </label>
            <select aria-label={`Phrase FX step ${index + 1}`} className={fieldClass}
              value={step.fx ?? 'OFF'} disabled={!padId}
              onChange={(event) => projectController.updateStep(patternIndex, index, { fx: event.target.value }, trackIndex)}>
              <option value="OFF">OFF</option><option value="FL">FL</option><option value="DR">DR</option><option value="DL">DL</option>
            </select>
            <select aria-label={`Phrase table step ${index + 1}`} className={fieldClass}
              value={step.tableId ?? ''} disabled={!padId}
              onChange={(event) => projectController.updateStep(patternIndex, index, {
                tableId: event.target.value ? Number(event.target.value) : null,
              }, trackIndex)}>
              <option value="">---</option>
              {projectController.getTables().map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
            </select>
          </div>
        );
      })}
      <div className="phrase-page-controls">
        {Array.from({ length: pageCount }, (_, index) => <button key={index} type="button"
          className={`${buttonClass} ${page === index ? 'border-cyan-400 text-cyan-300' : ''}`}
          aria-label={`Phrase page ${index + 1}${activeStep >= index * 16 && activeStep < (index + 1) * 16 ? ', playing' : ''}`}
          onClick={() => setPage(index)}>
          {hexStep(index * 16)}-{hexStep(index * 16 + 15)}
        </button>)}
        {transportBusy && <span className="text-amber-300">Stop to change instrument assignments.</span>}
      </div>
    </div>
  );
}

function TableRows({ table, playing }: { table: TrackerTable; playing: boolean }) {
  const [page, setPage] = useState(0);
  const [playingTicks, setPlayingTicks] = useState<number[]>([]);
  const pageCount = Math.ceil(table.steps.length / 16);
  const pageGroup = Math.floor(page / 8);

  useEffect(() => {
    if (!playing) {
      setPlayingTicks([]);
      return;
    }
    let frame: number;
    const update = () => {
      const ticks = trackerBridge.getPlayingTableTicks(table.id, pageGroup);
      setPlayingTicks((previous) => previous.length === ticks.length && previous.every((tick, index) => tick === ticks[index]) ? previous : ticks);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [pageGroup, playing, table.id]);

  return (
    <div className="table-grid-scroll table-sequencer-list flex-1 min-h-0" aria-label="Vertical table ticks">
      <div className="table-page-controls">
        <label className="control-block">PAGE <select aria-label="Table page" className={fieldClass}
          value={page} onChange={(event) => setPage(Number(event.target.value))}>
          {Array.from({ length: pageCount }, (_, index) => <option key={index} value={index}>{index + 1} · {hexStep(index * 16)}-{hexStep(index * 16 + 15)}</option>)}
        </select></label>
        <span className="text-zinc-400">TICKS {page * 16 + 1}-{Math.min((page + 1) * 16, table.steps.length)}</span>
      </div>
      <div className="table-grid-header table-sequencer-grid">
        <span>TICK</span><span>PITCH</span><span>FX</span><span>MICRO-TIMING</span>
      </div>
      {table.steps.slice(page * 16, page * 16 + 16).map((step, row) => {
        const index = page * 16 + row;
        const tickInGroup = page % 8 * 16 + row;
        return (
          <div className={`table-row table-sequencer-grid ${playingTicks.includes(tickInGroup) ? 'is-playing' : ''}`}
            key={index} data-tick={hexStep(row)}>
            <span className="table-step-address">{hexStep(row)} <small>/{String(index + 1).padStart(3, '0')}</small></span>
            <select aria-label={`Table pitch tick ${index + 1}`} className={fieldClass}
              value={step.pitch ?? ''} onChange={(event) => projectController.updateTableStep(table.id, index, {
                pitch: event.target.value === '' ? null : Number(event.target.value),
              })}>
              <option value="">HOLD</option>
              {Array.from({ length: 49 }, (_, i) => i - 24).map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
            </select>
            <select aria-label={`Table FX tick ${index + 1}`} className={fieldClass}
              value={step.reset ? 'OFF' : step.fx ?? 'OFF'} onChange={(event) => projectController.updateTableStep(table.id, index, {
                reset: false,
                fx: event.target.value as 'FL' | 'DL' | 'DR' | 'OFF',
              })}>
              <option value="OFF">OFF</option><option value="FL">FL</option><option value="DR">DR</option><option value="DL">DL</option>
            </select>
            <select aria-label={`Table microtiming tick ${index + 1}`} className={fieldClass}
              value={step.subTickOffset ?? 0} onChange={(event) => projectController.updateTableStep(table.id, index, {
                subTickOffset: Number(event.target.value),
              })}>
              {Array.from({ length: 9 }, (_, i) => i - 4).map((value) =>
                <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}
