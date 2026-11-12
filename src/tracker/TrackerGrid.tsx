/**
 * SP-M8x Hybrid Music Production Suite
 * TrackerGrid.tsx — 16-step viewport over a 64-step phrase
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { projectController } from '../project/projectController';
import { trackerEngine } from './trackerEngine';

export interface TrackerGridProps {
  patternId: string | number;
  activeStep?: number;
}

const PAGE_SIZE = 16;
const PAGE_COUNT = 4;
const PHRASE_SIZE = PAGE_SIZE * PAGE_COUNT;

type EditableStep = { note?: string; sampleId?: string; velocity?: number; fx?: string; subTickOffset?: number };

const toHex = (value: number | undefined, max: number): string =>
  Math.round(Math.max(0, Math.min(max, value ?? max))).toString(16).toUpperCase().padStart(2, '0');

export const TrackerGrid: React.FC<TrackerGridProps> = ({ patternId, activeStep = 0 }) => {
  const patternIndex = typeof patternId === 'number' ? patternId : Number.parseInt(patternId, 10) || 0;
  const [pageIndex, setPageIndex] = useState(Math.floor(Math.max(0, Math.min(63, activeStep)) / PAGE_SIZE));
  const [selectedStep, setSelectedStep] = useState(Math.max(0, Math.min(PHRASE_SIZE - 1, activeStep)));
  const [editRevision, setEditRevision] = useState(0);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const lastAutoPage = useRef<number | null>(null);

  useEffect(() => projectController.subscribe(() => setEditRevision((revision) => revision + 1)), []);

  const project = projectController.getState();
  const pattern = project.tracker.patterns[patternIndex] ?? project.tracker.patterns[0];
  const steps = useMemo(() => {
    const source = pattern?.steps ?? [];
    return Array.from({ length: PHRASE_SIZE }, (_, index) => source[index] ?? {
      note: '---', sampleId: '--', subTickOffset: 0, velocity: 127,
    });
  }, [pattern, editRevision]);

  const pageSteps = steps.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const selectedData = steps[selectedStep] ?? { note: '---', sampleId: '--', subTickOffset: 0, velocity: 127 };

  useEffect(() => {
    let frameId = 0;
    let mounted = true;
    const updatePlayhead = () => {
      if (!mounted) return;
      const position = trackerEngine.getPlayheadPosition();
      const playing = trackerEngine.getIsPlaying();
      if (playing && lastAutoPage.current !== position.pageIndex) {
        lastAutoPage.current = position.pageIndex;
        setPageIndex(position.pageIndex);
      }

      const localActiveStep = playing && position.pageIndex === pageIndex ? position.pageStepIndex : -1;
      rowRefs.current.forEach((row, index) => {
        if (!row) return;
        const active = index === localActiveStep;
        row.classList.toggle('tracker-playhead-active', active);
        if (active) row.setAttribute('aria-current', 'step');
        else row.removeAttribute('aria-current');
      });
      frameId = window.requestAnimationFrame(updatePlayhead);
    };
    frameId = window.requestAnimationFrame(updatePlayhead);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(frameId);
    };
  }, [pageIndex]);

  const updateStep = (index: number, patch: EditableStep) => projectController.updateStep(patternIndex, index, patch);

  const choosePage = (nextPage: number) => {
    const safePage = Math.max(0, Math.min(PAGE_COUNT - 1, nextPage));
    setPageIndex(safePage);
    lastAutoPage.current = safePage;
  };

  return (
    <section className="flex min-h-0 flex-col gap-2 rounded border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-zinc-200">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
        <div>
          <h2 className="text-[10px] font-bold tracking-widest text-cyan-300">PHRASE MATRIX · {pattern?.name ?? `PATTERN ${patternId}`}</h2>
          <p className="mt-1 text-[9px] text-zinc-500">64-step phrase · 16-step viewport · audio-clock playhead</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Phrase pages">
          {Array.from({ length: PAGE_COUNT }, (_, page) => (
            <button key={page} type="button" aria-pressed={pageIndex === page} onClick={() => choosePage(page)}
              className={`min-h-9 min-w-10 rounded border px-2 text-[10px] font-bold ${pageIndex === page ? 'border-cyan-400 bg-cyan-950 text-cyan-200' : 'border-zinc-700 text-zinc-400'}`}>
              P{page + 1}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[620px] border-collapse text-left text-[10px]">
          <thead className="sticky top-0 z-10 bg-zinc-900 text-[9px] uppercase tracking-wider text-zinc-400">
            <tr><th className="w-12 px-2 py-2">STEP</th><th className="px-2 py-2">NOTE</th><th className="px-2 py-2">INST</th><th className="w-16 px-2 py-2">VOL</th><th className="w-28 px-2 py-2">FX CMD</th><th className="w-24 px-2 py-2">SUB</th></tr>
          </thead>
          <tbody>
            {pageSteps.map((step, localIndex) => {
              const globalIndex = pageIndex * PAGE_SIZE + localIndex;
              return (
                <tr key={globalIndex} ref={(element) => { rowRefs.current[localIndex] = element; }}
                  onClick={() => setSelectedStep(globalIndex)}
                  className={`tracker-step-row cursor-pointer border-b border-zinc-800/80 ${selectedStep === globalIndex ? 'bg-zinc-800/80' : 'bg-zinc-950/40'} ${globalIndex % 4 === 0 ? 'border-t border-t-zinc-700' : ''}`}>
                  <td className="px-2 py-1.5 font-bold text-zinc-500">{String(globalIndex).padStart(2, '0')}</td>
                  <td className="px-1 py-1"><input aria-label={`Step ${globalIndex} note`} value={step.note || '---'} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStep(globalIndex, { note: event.target.value || '---' })} className="w-full rounded bg-transparent px-1 py-1 text-cyan-100 outline-none focus:bg-zinc-800" /></td>
                  <td className="px-1 py-1"><input aria-label={`Step ${globalIndex} instrument`} value={step.sampleId || '--'} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStep(globalIndex, { sampleId: event.target.value || '--' })} className="w-full rounded bg-transparent px-1 py-1 text-emerald-200 outline-none focus:bg-zinc-800" /></td>
                  <td className="px-2 py-1 font-bold text-amber-200">{toHex(step.velocity, 127)}</td>
                  <td className="px-1 py-1"><input aria-label={`Step ${globalIndex} FX command`} value={step.fx || '-- --'} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStep(globalIndex, { fx: event.target.value || undefined })} className="w-full rounded bg-transparent px-1 py-1 text-fuchsia-200 outline-none focus:bg-zinc-800" /></td>
                  <td className="px-1 py-1"><select aria-label={`Step ${globalIndex} sub tick`} value={step.subTickOffset ?? 0} onClick={(event) => event.stopPropagation()} onChange={(event) => updateStep(globalIndex, { subTickOffset: Number(event.target.value) })} className="min-h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-cyan-200">{Array.from({ length: 8 }, (_, value) => <option key={value} value={value}>{value}</option>)}</select></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-2 text-[9px] text-zinc-500">
        <span>PAGE {pageIndex + 1}/4 · STEPS {String(pageIndex * PAGE_SIZE).padStart(2, '0')}–{String(pageIndex * PAGE_SIZE + PAGE_SIZE - 1).padStart(2, '0')}</span>
        <span>EDIT STEP {String(selectedStep).padStart(2, '0')} · SUB {selectedData.subTickOffset ?? 0}/7</span>
      </footer>
      <style>{`.tracker-step-row.tracker-playhead-active { background: rgba(8, 145, 178, 0.28); box-shadow: inset 3px 0 0 #22d3ee; }`}</style>
    </section>
  );
};

export default TrackerGrid;
