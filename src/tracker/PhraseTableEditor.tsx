import React, { useEffect, useState } from 'react';
import { projectController, type Pattern, type PhraseLength, type TrackerTable } from '../project/projectController';
import type { PadSlot } from '../sampler/usePadBank';
import { useStepDeletion } from './useStepDeletion';
import { phraseTimingMarkers } from './phraseTiming';
import { trackerBridge } from './trackerBridge';
import { instrumentIdToPadId, padIdToInstrumentId } from '../sampler/padIds';

const fieldClass = 'bg-zinc-950 border border-zinc-700 px-2 py-1 text-zinc-100';
const buttonClass = 'border border-zinc-700 px-2 py-1 text-zinc-300';
const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = (midi: number) => `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;

interface EditorProps {
  slots: Record<string, PadSlot>;
  activeStep: number;
  transportBusy: boolean;
  mode: 'phrase' | 'table';
}

export function PhraseTableEditor({ slots, activeStep, transportBusy, mode }: EditorProps) {
  const [tableId, setTableId] = useState<number | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const state = projectController.getState();
  const patternIndex = state.settings.activePatternIndex;
  const pattern = state.tracker.patterns[patternIndex];
  const tables = projectController.getTables();
  const table = tables.find((item) => item.id === tableId) ?? tables[0];
  if (!pattern) return <p role="alert">Active phrase is unavailable.</p>;

  return (
    <section className="flex-1 min-h-0 flex flex-col gap-2 p-3 bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl font-mono text-xs">
      <div className="flex items-center gap-2">
        <label className="control-block">TRK <select aria-label="Phrase track" className={fieldClass} value={trackIndex}
          onChange={(event) => setTrackIndex(Number(event.target.value))}>
          {Array.from({ length: 8 }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
        </select></label>
        {mode === 'phrase' ? (
          <>
            <label className="control-block">PHR <select aria-label="Active phrase" className={fieldClass} value={patternIndex} disabled={transportBusy}
              onChange={(event) => projectController.setActivePattern(Number(event.target.value))}>
              {state.tracker.patterns.map((item, index) => <option key={item.id} value={index}>{item.name}</option>)}
            </select></label>
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
        ? <PhraseRows key={`${pattern.id}-${trackIndex}-${pattern.length}`} pattern={pattern} patternIndex={patternIndex} trackIndex={trackIndex} slots={slots} activeStep={activeStep} transportBusy={transportBusy} />
        : <div className="flex-1 min-h-0 flex flex-col gap-2">
            <PhraseTimingGrid key={`${pattern.id}-${trackIndex}-${pattern.length}`} pattern={pattern} patternIndex={patternIndex} trackIndex={trackIndex} activeStep={activeStep} />
            {table ? <TableRows key={`${table.id}-${pattern.length}`} table={table} pageCount={pattern.length / 16} playing={activeStep >= 0} /> : <p className="text-zinc-400">Create a reusable table, then assign it to a phrase step.</p>}
          </div>}
    </section>
  );
}

function PhraseRows({ pattern, patternIndex, trackIndex, slots, activeStep, transportBusy }: {
  pattern: Pattern; patternIndex: number; trackIndex: number; slots: Record<string, PadSlot>; activeStep: number; transportBusy: boolean;
}) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(0);
  const steps = pattern.tracks[trackIndex].steps;
  const deletion = useStepDeletion((indices) => projectController.clearStepNotes(patternIndex, indices, trackIndex));
  const step = steps[selected];
  const padId = step ? instrumentIdToPadId(step.instrumentId) : null;
  const assigned = padId !== null;
  const update = (changes: Parameters<typeof projectController.updateStep>[2]) => projectController.updateStep(patternIndex, selected, changes, trackIndex);
  const pads = Object.values(slots).filter((slot) => slot.sampleKey);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      <div className="flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-1 text-[10px]">
          {Array.from({ length: pattern.length / 16 }, (_, index) => <button key={index} type="button" className={`${buttonClass} ${page === index ? 'border-cyan-400 text-cyan-300' : ''}`}
            aria-label={`Phrase page ${index + 1}${activeStep >= index * 16 && activeStep < (index + 1) * 16 ? ', playing' : ''}`}
            style={activeStep >= index * 16 && activeStep < (index + 1) * 16 ? { boxShadow: 'inset 0 -2px #22d3ee' } : undefined}
            onClick={() => { setPage(index); setSelected(index * 16); }}>{index + 1}</button>)}
          <span className="ml-auto">{deletion.controls}</span>
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
          {steps.slice(page * 16, page * 16 + 16).map((item, offset) => {
            const index = page * 16 + offset;
            const occupied = Boolean((item.note && item.note !== '---') || item.instrumentId !== null);
            return <button type="button" key={index} aria-label={`Phrase step ${index + 1}`}
              aria-pressed={deletion.selected.has(index)}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                deletion.onPointerDown(event, index, occupied);
                if (!deletion.isSelecting()) setSelected(index);
              }}
              onPointerUp={() => {}}
              onPointerCancel={() => deletion.onPointerCancel(index)}
              onClick={() => { if (!deletion.consumeClick(index)) setSelected(index); }}
              data-playing={activeStep === index || undefined}
              style={activeStep === index ? { boxShadow: 'inset 0 0 0 2px #22d3ee' } : undefined}
              className={`touch-none select-none flex flex-col text-left px-1 py-2 min-w-0 border border-zinc-800 ${deletion.selected.has(index) ? 'bg-rose-950 text-rose-200' : selected === index ? 'bg-cyan-950 text-cyan-200' : 'text-zinc-300'} ${activeStep === index ? 'border-cyan-400' : ''}`}>
              <span>{String(index + 1).padStart(2, '0')}</span><span>{item.note || '---'}</span><span>{instrumentIdToPadId(item.instrumentId) ?? '--'}</span>
              <span>{occupied ? item.velocity ?? 127 : '--'}</span><span>{occupied ? item.subTickOffset ?? 0 : '--'}</span><span>{item.tableId ?? '--'}</span>
              <span>{item.fx ?? '--'}</span>
            </button>;
          })}
        </div>
      </div>
      {step && <div className="flex flex-wrap items-start gap-3 text-zinc-400">
        <strong className="text-cyan-300">EDIT STEP {String(selected + 1).padStart(2, '0')}</strong>
        <label className="flex flex-col gap-1">PAD
          <select aria-label="Step pad" className={fieldClass} value={padId ?? '--'} disabled={transportBusy}
            onChange={(event) => {
              const sampleId = event.target.value;
              if (sampleId === '--') projectController.clearStepNotes(patternIndex, [selected], trackIndex);
              else update({ instrumentId: padIdToInstrumentId(sampleId), note: step.note && step.note !== '---' ? step.note : 'C-4' });
            }}>
            <option value="--">EMPTY</option>
            {padId && !slots[padId]?.sampleKey && <option value={padId}>{padId} (missing)</option>}
            {pads.map((pad) => <option key={pad.id} value={pad.id}>{pad.id} — {pad.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">NOTE
          <select aria-label="Step note" className={fieldClass} value={step.note || '---'} disabled={!assigned}
            onChange={(event) => update({ note: event.target.value })}>
            <option value="---">---</option>
            {Array.from({ length: 72 }, (_, i) => noteName(i + 24)).map((note) => <option key={note}>{note}</option>)}
            <option value="OFF">OFF</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">VELOCITY
          <input aria-label="Step velocity" type="range" min="0" max="127" value={step.velocity ?? 127} disabled={!assigned}
            onChange={(event) => update({ velocity: Number(event.target.value) })} />
          <span>{step.velocity ?? 127}</span>
        </label>
        <label className="flex flex-col gap-1">MICROTIMING (⅛ STEP)
          <select aria-label="Step microtiming" className={fieldClass} value={step.subTickOffset ?? 0} disabled={!assigned}
            onChange={(event) => update({ subTickOffset: Number(event.target.value) })}>
            {Array.from({ length: 9 }, (_, i) => i - 4).map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">TABLE
          <select aria-label="Step table" className={fieldClass} value={step.tableId ?? ''} disabled={!assigned}
            onChange={(event) => update({ tableId: event.target.value ? Number(event.target.value) : null })}>
            <option value="">NONE</option>
            {projectController.getTables().map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">FX
          <select aria-label="Phrase FX" className={fieldClass} value={step.fx ?? 'OFF'} disabled={!assigned}
            onChange={(event) => update({ fx: event.target.value || undefined })}>
            <option value="FL">FILTER</option>
            <option value="DR">DRIVE</option>
            <option value="DL">DELAY</option>
            <option value="OFF">OFF</option>
          </select>
        </label>
        {step.fx && step.fx !== 'OFF' && <label className="flex flex-col gap-1">FX VALUE
          <input aria-label="Phrase FX value" type="number" min="0" max="127" value={step.fxValue ?? 64}
            onChange={(event) => update({ fxValue: Math.max(0, Math.min(127, Number(event.target.value))) })} />
        </label>}
        <button type="button" className={buttonClass} disabled={!assigned} onClick={() => {
          if (window.confirm(`Clear the note on step ${selected + 1}?`)) projectController.clearStepNotes(patternIndex, [selected], trackIndex);
        }}>CLEAR NOTE</button>
        {transportBusy && <span className="text-amber-300">Stop to change pad assignments.</span>}
      </div>}
    </div>
  );
}

function PhraseTimingGrid({ pattern, patternIndex, trackIndex, activeStep }: { pattern: Pattern; patternIndex: number; trackIndex: number; activeStep: number }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const steps = pattern.tracks[trackIndex].steps;
  const events = phraseTimingMarkers(steps.slice(0, pattern.length), page);
  const step = selected === null ? null : steps[selected];
  return (
    <div className="border border-zinc-800 rounded p-2">
      <div className="flex items-center gap-2 text-[10px] mb-1">
        <strong className="text-purple-300">PHRASE TIMING — 64 POSITIONS / PAGE</strong>
        {Array.from({ length: pattern.length / 16 }, (_, index) => <button key={index} type="button" className={`${buttonClass} ${page === index ? 'text-purple-300 border-purple-400' : ''}`}
          aria-label={`Timing page ${index + 1}${activeStep >= index * 16 && activeStep < (index + 1) * 16 ? ', playing' : ''}`}
          style={activeStep >= index * 16 && activeStep < (index + 1) * 16 ? { boxShadow: 'inset 0 -2px #22d3ee' } : undefined}
          onClick={() => { setPage(index); setSelected(null); }}>PAGE {index + 1}</button>)}
        <span className="text-zinc-400">½ cell = ⅛ step · tap a marker to nudge</span>
      </div>
      <div className="phrase-timing-list" aria-label="64 vertical phrase timing positions">
        {Array.from({ length: 64 }, (_, row) => {
          const rowEvents = events.filter((event) => Math.floor(event.tick / 2) === row);
          const playingPosition = activeStep >= page * 16 && activeStep < (page + 1) * 16
            ? (activeStep - page * 16) * 4 : -1;
          return <div key={row} className={`phrase-timing-row ${playingPosition === row ? 'is-playing' : ''}`} data-position={row.toString(16).toUpperCase().padStart(2, '0')}>
            <span className="phrase-timing-index">{row.toString(16).toUpperCase().padStart(2, '0')}</span>
            <span className="phrase-timing-cell">
              {rowEvents.map(({ index, tick }) => <button key={index} type="button"
                aria-label={`Timing note step ${index + 1}, offset ${steps[index].subTickOffset ?? 0}`}
                title={`${instrumentIdToPadId(steps[index].instrumentId) ?? '--'} step ${index + 1}, offset ${steps[index].subTickOffset ?? 0}/8`}
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
                className={`phrase-timing-marker ${tick % 2 ? 'is-half' : ''} ${selected === index ? 'is-selected' : ''}`}>
                {instrumentIdToPadId(steps[index].instrumentId) ?? '--'}
              </button>)}
            </span>
          </div>;
        })}
      </div>
      <div className="flex gap-2 items-center mt-1 text-[10px] text-zinc-400">
        {step && selected !== null && <>
          <span>STEP {selected + 1} {instrumentIdToPadId(step.instrumentId) ?? '--'} · {step.note} · VEL {step.velocity ?? 127}</span>
          <label>OFFSET <select aria-label="Timing note offset" className={fieldClass} value={step.subTickOffset ?? 0}
            onChange={(event) => projectController.updateStep(patternIndex, selected, { subTickOffset: Number(event.target.value) }, trackIndex)}>
            {Array.from({ length: 9 }, (_, i) => i - 4).map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
          </select></label>
        </>}
        <span className="ml-auto">FX latch, swing and stutter automation not yet available</span>
      </div>
    </div>
  );
}

function TableRows({ table, playing, pageCount }: { table: TrackerTable; playing: boolean; pageCount: number }) {
  const [page, setPage] = useState(0);
  const [selectedOnPage, setSelectedOnPage] = useState(0);
  const selected = page * 128 + selectedOnPage;
  const [playingTicks, setPlayingTicks] = useState<number[]>([]);
  useEffect(() => {
    if (!playing) {
      setPlayingTicks([]);
      return;
    }
    let frame: number;
    const update = () => {
      const ticks = trackerBridge.getPlayingTableTicks(table.id, page);
      setPlayingTicks((previous) => previous.length === ticks.length && previous.every((tick, index) => tick === ticks[index]) ? previous : ticks);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [page, playing, table.id]);
  const deletion = useStepDeletion((indices) => projectController.clearTableSteps(table.id, indices));
  const step = table.steps[selected];
  return (
    <div className="flex-1 min-h-0 flex gap-4">
      <div className="flex flex-col min-h-0 w-3/5">
        <div className="flex justify-between items-center mb-1 text-[10px]">
          <span>TICK / PITCH / FX {playingTicks.length > 0 && `· PLAY ${playingTicks.map((tick) => String(tick + 1).padStart(3, '0')).join(', ')}`}</span>
          {deletion.controls}
        </div>
        <div className="flex gap-1 mb-1">
          {Array.from({ length: pageCount }, (_, pageIndex) => <button key={pageIndex} type="button"
            aria-label={`Table page ${pageIndex + 1}, phrase steps ${(pageIndex * 16).toString(16).toUpperCase().padStart(2, '0')}–${(pageIndex * 16 + 15).toString(16).toUpperCase().padStart(2, '0')}`}
            aria-pressed={page === pageIndex}
            className={`${buttonClass} ${page === pageIndex ? 'border-purple-400 text-purple-300' : ''}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              setPage(pageIndex);
              setSelectedOnPage(0);
            }}
            onPointerUp={() => {}}>PAGE {pageIndex + 1} · 128 TICKS</button>)}
        </div>
        <div className="table-tick-list">
          {Array.from({ length: 64 }, (_, row) => {
          const firstTick = row * 2;
          return <div className="table-tick-row" key={row}>
            <span className="table-tick-index">{row.toString(16).toUpperCase().padStart(2, '0')}</span>
            {[firstTick, firstTick + 1].map((localIndex) => {
              const index = page * 128 + localIndex;
              const item = table.steps[index];
              if (!item) return null;
              return <button type="button" key={index} aria-label={`Table tick ${index + 1}`}
                aria-pressed={deletion.selected.has(index)}
                onPointerDown={(event) => {
                  deletion.onPointerDown(event, index, item.pitch !== null || Boolean(item.reset) || Boolean(item.fx) || item.volume !== null);
                  if (!deletion.isSelecting()) setSelectedOnPage(localIndex);
                }}
                onPointerCancel={() => deletion.onPointerCancel(index)}
                onClick={() => { if (!deletion.consumeClick(index)) setSelectedOnPage(localIndex); }}
                data-playing={playingTicks.includes(localIndex) || undefined}
                className={`table-tick-cell ${deletion.selected.has(index) ? 'is-delete-selected' : selectedOnPage === localIndex ? 'is-selected' : ''} ${playingTicks.includes(localIndex) ? 'is-playing' : ''}`}>
                <span>{localIndex % 2 ? '½' : '·'}</span>
                <span>{item.pitch ?? '--'} · {item.reset ? 'OFF' : item.fx ?? '--'}</span>
              </button>;
            })}
          </div>;
          })}
        </div>
      </div>
      {step && <div className="flex flex-col gap-3 text-zinc-400">
        <strong className="text-purple-300">EDIT TICK {String(selected + 1).padStart(2, '0')}</strong>
        <label className="flex flex-col gap-1">PITCH (SEMITONES)
          <select aria-label="Table pitch" className={fieldClass} value={step.pitch ?? ''}
            onChange={(event) => projectController.updateTableStep(table.id, selected, { pitch: event.target.value === '' ? null : Number(event.target.value) })}>
            <option value="">HOLD</option>
            {Array.from({ length: 49 }, (_, i) => i - 24).map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">FX
          <select aria-label="Table FX" className={fieldClass} value={step.reset ? 'OFF' : step.fx ?? 'OFF'}
            onChange={(event) => projectController.updateTableStep(table.id, selected, {
              reset: false,
              fx: event.target.value ? event.target.value as 'FL' | 'DL' | 'DR' | 'OFF' : undefined,
            })}>
            <option value="FL">FILTER</option><option value="DR">DRIVE</option><option value="DL">DELAY</option>
            <option value="OFF">OFF</option>
          </select>
        </label>
        {(step.fx === 'FL' || step.fx === 'DL' || step.fx === 'DR') && <label className="flex flex-col gap-1">FX VALUE
          <input aria-label="Table FX value" type="number" min="0" max="127" value={step.fxValue ?? 64}
            onChange={(event) => projectController.updateTableStep(table.id, selected, { fxValue: Math.max(0, Math.min(127, Number(event.target.value))) })} />
        </label>}
        <span className="max-w-64 text-[10px]">64 rows per page · two ticks per row · ½ cell = ⅛ step. Values hold until changed.</span>
      </div>}
    </div>
  );
}
