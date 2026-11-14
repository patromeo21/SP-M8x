import React, { useState } from 'react';
import { projectController, type Pattern, type TrackerTable } from '../project/projectController';
import type { PadSlot } from '../sampler/usePadBank';
import { useStepDeletion } from './useStepDeletion';

const fieldClass = 'bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-100';
const buttonClass = 'border border-zinc-700 rounded px-2 py-1 text-zinc-300';
const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = (midi: number) => `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;

interface EditorProps {
  slots: Record<string, PadSlot>;
  activeStep: number;
  transportBusy: boolean;
}

export function PhraseTableEditor({ slots, activeStep, transportBusy }: EditorProps) {
  const [mode, setMode] = useState<'phrase' | 'table'>('phrase');
  const [tableId, setTableId] = useState<number | null>(null);
  const state = projectController.getState();
  const patternIndex = state.settings.activePatternIndex;
  const pattern = state.tracker.patterns[patternIndex];
  const tables = projectController.getTables();
  const table = tables.find((item) => item.id === tableId) ?? tables[0];
  if (!pattern) return <p role="alert">Active phrase is unavailable.</p>;

  return (
    <section className="flex-1 min-h-0 flex flex-col gap-2 p-3 bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl font-mono text-xs">
      <div className="flex items-center gap-2">
        <button type="button" className={`${buttonClass} ${mode === 'phrase' ? 'text-cyan-300 border-cyan-500' : ''}`} onClick={() => setMode('phrase')}>PHRASE</button>
        <button type="button" className={`${buttonClass} ${mode === 'table' ? 'text-purple-300 border-purple-500' : ''}`} onClick={() => setMode('table')}>TABLE</button>
        {mode === 'phrase' ? (
          <>
            <label>PHRASE <select aria-label="Active phrase" className={fieldClass} value={patternIndex} disabled={transportBusy}
              onChange={(event) => projectController.setActivePattern(Number(event.target.value))}>
              {state.tracker.patterns.map((item, index) => <option key={item.id} value={index}>{item.name}</option>)}
            </select></label>
            <button type="button" className={buttonClass} disabled={transportBusy} onClick={() => projectController.createPattern()}>NEW PHRASE</button>
          </>
        ) : (
          <>
            <label>TABLE <select aria-label="Active table" className={fieldClass} value={table?.id ?? ''}
              onChange={(event) => setTableId(Number(event.target.value))}>
              {!table && <option value="">NONE</option>}
              {tables.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <button type="button" className={buttonClass} onClick={() => setTableId(projectController.createTable())}>NEW TABLE</button>
          </>
        )}
      </div>
      {mode === 'phrase'
        ? <PhraseRows key={pattern.id} pattern={pattern} patternIndex={patternIndex} slots={slots} activeStep={activeStep} transportBusy={transportBusy} />
        : table ? <TableRows key={table.id} table={table} /> : <p className="text-zinc-400">Create a table, then assign it to a phrase step.</p>}
    </section>
  );
}

function PhraseRows({ pattern, patternIndex, slots, activeStep, transportBusy }: {
  pattern: Pattern; patternIndex: number; slots: Record<string, PadSlot>; activeStep: number; transportBusy: boolean;
}) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(0);
  const deletion = useStepDeletion((indices) => projectController.clearStepNotes(patternIndex, indices));
  const step = pattern.steps[selected];
  const assigned = Boolean(step?.sampleId && step.sampleId !== '--');
  const update = (changes: Parameters<typeof projectController.updateStep>[2]) => projectController.updateStep(patternIndex, selected, changes);
  const pads = Object.values(slots).filter((slot) => slot.sampleKey);

  return (
    <div className="flex-1 min-h-0 flex gap-4">
      <div className="flex flex-col min-h-0 w-3/5">
        <div className="flex items-center gap-2 mb-1 text-[10px]">
          {[0, 1, 2, 3].map((index) => <button key={index} type="button" className={`${buttonClass} ${page === index ? 'border-cyan-400 text-cyan-300' : ''}`}
            onClick={() => { setPage(index); setSelected(index * 16); }}>{index + 1}</button>)}
          <span className="ml-auto">{deletion.controls}</span>
        </div>
        <div className="grid grid-cols-[3rem_1fr_1fr_3rem_3rem_3rem] text-zinc-500 text-[10px] px-2">
          <span>STEP</span><span>NOTE</span><span>PAD</span><span>VEL</span><span>µ</span><span>TBL</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          {pattern.steps.slice(page * 16, page * 16 + 16).map((item, offset) => {
            const index = page * 16 + offset;
            const occupied = Boolean((item.note && item.note !== '---') || (item.sampleId && item.sampleId !== '--'));
            return <button type="button" key={index} aria-label={`Phrase step ${index + 1}`}
              aria-pressed={deletion.selected.has(index)}
              onPointerDown={(event) => deletion.onPointerDown(event, index, occupied)}
              onPointerCancel={() => deletion.onPointerCancel(index)}
              onClick={() => { if (!deletion.consumeClick(index)) setSelected(index); }}
              className={`grid grid-cols-[3rem_1fr_1fr_3rem_3rem_3rem] text-left px-2 flex-1 min-h-0 border-b border-zinc-800 ${deletion.selected.has(index) ? 'bg-rose-950 text-rose-200' : selected === index ? 'bg-cyan-950 text-cyan-200' : 'text-zinc-300'} ${activeStep === index ? 'border-l-4 border-l-cyan-400' : ''}`}>
              <span>{String(index + 1).padStart(2, '0')}</span><span>{item.note || '---'}</span><span>{item.sampleId || '--'}</span>
              <span>{occupied ? item.velocity ?? 127 : '--'}</span><span>{occupied ? item.subTickOffset ?? 0 : '--'}</span><span>{item.tableId ?? '--'}</span>
            </button>;
          })}
        </div>
      </div>
      {step && <div className="flex flex-col gap-3 text-zinc-400">
        <strong className="text-cyan-300">EDIT STEP {String(selected + 1).padStart(2, '0')}</strong>
        <label className="flex flex-col gap-1">PAD
          <select aria-label="Step pad" className={fieldClass} value={step.sampleId || '--'} disabled={transportBusy}
            onChange={(event) => {
              const sampleId = event.target.value;
              if (sampleId === '--') projectController.clearStepNotes(patternIndex, [selected]);
              else update({ sampleId, note: step.note && step.note !== '---' ? step.note : 'C-4' });
            }}>
            <option value="--">EMPTY</option>
            {step.sampleId && step.sampleId !== '--' && !slots[step.sampleId]?.sampleKey && <option value={step.sampleId}>{step.sampleId} (missing)</option>}
            {pads.map((pad) => <option key={pad.id} value={pad.id}>{pad.id} — {pad.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">NOTE
          <select aria-label="Step note" className={fieldClass} value={step.note === '---' ? 'C-4' : step.note} disabled={!assigned}
            onChange={(event) => update({ note: event.target.value })}>
            {Array.from({ length: 72 }, (_, i) => noteName(i + 24)).map((note) => <option key={note}>{note}</option>)}
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
        {transportBusy && <span className="text-amber-300">Stop to change pad assignments.</span>}
      </div>}
    </div>
  );
}

function TableRows({ table }: { table: TrackerTable }) {
  const [selected, setSelected] = useState(0);
  const deletion = useStepDeletion((indices) => projectController.clearTableSteps(table.id, indices));
  const step = table.steps[selected];
  return (
    <div className="flex-1 min-h-0 flex gap-4">
      <div className="flex flex-col min-h-0 w-3/5">
        <div className="flex justify-between items-center mb-1 text-[10px]"><span>TICK / PITCH / VOLUME</span>{deletion.controls}</div>
        <div className="flex-1 min-h-0 flex flex-col">
          {table.steps.map((item, index) => <button type="button" key={index} aria-label={`Table tick ${index + 1}`}
            aria-pressed={deletion.selected.has(index)}
            onPointerDown={(event) => deletion.onPointerDown(event, index, item.pitch !== null || item.volume !== null)}
            onPointerCancel={() => deletion.onPointerCancel(index)}
            onClick={() => { if (!deletion.consumeClick(index)) setSelected(index); }}
            className={`grid grid-cols-3 text-left px-2 flex-1 min-h-0 border-b border-zinc-800 ${deletion.selected.has(index) ? 'bg-rose-950 text-rose-200' : selected === index ? 'bg-purple-950 text-purple-200' : 'text-zinc-300'}`}>
            <span>{String(index + 1).padStart(2, '0')}</span><span>{item.pitch ?? '--'}</span><span>{item.volume ?? '--'}</span>
          </button>)}
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
        <label className="flex flex-col gap-1">VOLUME
          <select aria-label="Table volume" className={fieldClass} value={step.volume ?? ''}
            onChange={(event) => projectController.updateTableStep(table.id, selected, { volume: event.target.value === '' ? null : Number(event.target.value) })}>
            <option value="">HOLD</option>
            {Array.from({ length: 128 }, (_, value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <span className="max-w-64 text-[10px]">One tick per ⅛ phrase step. Values hold until changed; the last value holds after tick 16.</span>
      </div>}
    </div>
  );
}
