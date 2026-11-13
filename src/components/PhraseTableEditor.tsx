/**
 * SP-M8x — PHRASE/TABLE editor for per-step automation data
 */
import React, { useEffect, useState } from 'react';
import { projectController } from '../project/projectController';

export const PhraseTableEditor: React.FC = () => {
  const [revision, setRevision] = useState(0);
  const [selectedStep, setSelectedStep] = useState(0);
  useEffect(() => projectController.subscribe(() => setRevision((value) => value + 1)), []);

  const project = projectController.getState();
  const patternIndex = Math.max(0, Math.min(project.tracker.patterns.length - 1, project.settings.activePatternIndex));
  const pattern = project.tracker.patterns[patternIndex];
  const steps = pattern?.steps ?? [];
  const step = steps[selectedStep] ?? { note: '---', sampleId: '--', velocity: 127, subTickOffset: 0 };
  const patch = (data: { tablePitch?: number | null; tableVolume?: number | null; tableFx?: string; tableFxValue?: number }) =>
    projectController.updateStep(patternIndex, selectedStep, data);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 border border-[var(--border-grid)] bg-[var(--bg-canvas)] p-2" data-revision={revision}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-grid)] pb-2">
        <div>
          <h2 className="text-[10px] font-bold tracking-widest text-[var(--accent-table)]">PHRASE / TABLE · {pattern?.name ?? 'NO PHRASE'}</h2>
          <p className="mt-1 text-[9px] text-zinc-500">Per-step automation data · independent of the shared Punch-In FX bus</p>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-[9px] text-zinc-400">EDIT STEP
          <select value={selectedStep} onChange={(event) => setSelectedStep(Number(event.target.value))} className="min-h-10 rounded border border-zinc-700 bg-zinc-900 px-3 text-cyan-200">
            {Array.from({ length: 64 }, (_, index) => <option key={index} value={index}>{String(index).padStart(2, '0')}</option>)}
          </select>
        </label>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-auto landscape:grid-cols-[minmax(220px,2fr)_minmax(0,3fr)]">
        <section className="flex min-h-0 flex-col gap-2 border border-zinc-800 bg-zinc-950/50 p-3">
          <h3 className="text-[9px] font-bold tracking-widest text-cyan-300">STEP PARAMETERS</h3>
          <div className="grid grid-cols-2 gap-2 text-[9px] text-zinc-400">
            <div className="rounded border border-zinc-800 p-2">NOTE <strong className="ml-2 text-zinc-200">{step.note || '---'}</strong></div>
            <div className="rounded border border-zinc-800 p-2">INST <strong className="ml-2 text-zinc-200">{step.sampleId || '--'}</strong></div>
            <div className="rounded border border-zinc-800 p-2">SUB <strong className="ml-2 text-zinc-200">{step.subTickOffset ?? 0}/7</strong></div>
            <div className="rounded border border-zinc-800 p-2">VOL <strong className="ml-2 text-zinc-200">{step.velocity ?? 127}</strong></div>
          </div>
          <p className="mt-auto text-[9px] leading-relaxed text-zinc-500">The phrase grid owns note, instrument, velocity, and SUB timing. This page edits the separate table automation lanes below.</p>
        </section>

        <section className="flex min-h-0 flex-col gap-3 border border-zinc-800 bg-zinc-950/50 p-3">
          <h3 className="text-[9px] font-bold tracking-widest text-[var(--accent-table)]">AUTOMATION LANES · STEP {String(selectedStep).padStart(2, '0')}</h3>
          <label className="grid grid-cols-[90px_1fr_42px] items-center gap-2 text-[9px] text-zinc-400">
            <span>PITCH (SEMITONES)</span>
            <input aria-label="Table pitch automation" type="range" min={-24} max={24} value={step.tablePitch ?? 0} onChange={(event) => patch({ tablePitch: Number(event.target.value) })} className="accent-cyan-400" />
            <span className="text-right text-cyan-200">{step.tablePitch ?? '—'}</span>
          </label>
          <label className="grid grid-cols-[90px_1fr_42px] items-center gap-2 text-[9px] text-zinc-400">
            <span>VOLUME</span>
            <input aria-label="Table volume automation" type="range" min={0} max={127} value={step.tableVolume ?? (step.velocity ?? 127)} onChange={(event) => patch({ tableVolume: Number(event.target.value) })} className="accent-emerald-400" />
            <span className="text-right text-emerald-200">{step.tableVolume ?? '—'}</span>
          </label>
          <label className="grid grid-cols-[90px_1fr] items-center gap-2 text-[9px] text-zinc-400">
            <span>TABLE FX LABEL</span>
            <input aria-label="Table FX label" value={step.tableFx ?? ''} onChange={(event) => patch({ tableFx: event.target.value })} placeholder="Unassigned" className="min-h-10 rounded border border-zinc-700 bg-zinc-900 px-2 text-zinc-100 outline-none focus:border-purple-400" />
          </label>
          <label className="grid grid-cols-[90px_1fr_42px] items-center gap-2 text-[9px] text-zinc-400">
            <span>FX VALUE</span>
            <input aria-label="Table FX value" type="range" min={0} max={255} value={step.tableFxValue ?? 0} onChange={(event) => patch({ tableFxValue: Number(event.target.value) })} className="accent-purple-400" />
            <span className="text-right text-purple-200">{(step.tableFxValue ?? 0).toString(16).toUpperCase().padStart(2, '0')}</span>
          </label>
          <div className="mt-auto grid grid-cols-8 gap-1" aria-label="Phrase automation overview">
            {steps.slice(0, 64).map((item, index) => {
              const normalized = Math.max(0, Math.min(1, ((item.tableVolume ?? item.velocity ?? 0) / 127)));
              return <button key={index} type="button" title={`Step ${index}: volume ${item.tableVolume ?? 'inherit'}`} onClick={() => setSelectedStep(index)}
                className={`flex h-12 items-end justify-center border ${selectedStep === index ? 'border-cyan-400 bg-cyan-950/40' : 'border-zinc-800 bg-zinc-900/50'}`}>
                <span className="w-full bg-emerald-400/70" style={{ height: `${Math.max(4, normalized * 100)}%` }} />
              </button>;
            })}
          </div>
          <p className="text-[8px] text-zinc-600">64-step volume overview · blank override inherits the phrase step velocity. FX labels are stored only; opcode execution is not yet defined.</p>
        </section>
      </div>
    </section>
  );
};

export default PhraseTableEditor;
