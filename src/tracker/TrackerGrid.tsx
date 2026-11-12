/**
 * SP-M8x Hybrid Music Production Suite
 * TrackerGrid.tsx — Step Sequencer Grid Matrix View
 */

import React, { useEffect, useMemo, useState } from 'react';
import { projectController } from '../project/projectController';

export interface TrackerGridProps {
  patternId: string | number;
  activeStep?: number;
}

const STEP_COUNT = 16;

export const TrackerGrid: React.FC<TrackerGridProps> = ({ patternId, activeStep = 0 }) => {
  const projectState = projectController.getState();

  const patternIndex = typeof patternId === 'number' ? patternId : parseInt(patternId, 10) || 0;
  const currentPattern = projectState.tracker.patterns[patternIndex] || projectState.tracker.patterns[0];
  const steps = useMemo(() => {
    const patternSteps = currentPattern?.steps ?? [];
    return patternSteps.slice(0, STEP_COUNT);
  }, [currentPattern]);

  const [selectedStep, setSelectedStep] = useState<number>(Math.min(activeStep, STEP_COUNT - 1));

  useEffect(() => {
    setSelectedStep(Math.min(activeStep, STEP_COUNT - 1));
  }, [activeStep]);

  const selectedStepData = steps[selectedStep] ?? {
    note: '---',
    sampleId: '--',
    subTickOffset: 0,
    velocity: 127,
  };

  const updateSelection = (update: Partial<typeof selectedStepData>) => {
    projectController.updateStep(patternIndex, selectedStep, update as any);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 font-mono select-none">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <h2 className="text-xs font-bold text-zinc-400">
          TRACKER MATRIX — {currentPattern ? currentPattern.name : `PATTERN ${patternId}`}
        </h2>
        <span className="text-[10px] font-bold text-cyan-400">16 STEPS</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        {steps.map((step, idx) => {
          const isActive = idx === selectedStep;
          const hasNote = step.note && step.note !== '---';

          return (
            <button
              type="button"
              key={idx}
              onClick={() => setSelectedStep(idx)}
              className={`flex flex-col items-center justify-center rounded border p-2 text-[10px] transition-all ${
                isActive
                  ? 'border-cyan-400 bg-cyan-950 text-cyan-300 shadow-sm shadow-cyan-500/20'
                  : hasNote
                    ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
                    : 'border-zinc-800/80 bg-zinc-950/80 text-zinc-600'
              }`}
            >
              <span className="mb-0.5 text-[8px] text-zinc-500">{String(idx + 1).padStart(2, '0')}</span>
              <span className="font-bold tracking-wider">{step.note || '---'}</span>
              <span className="mt-0.5 text-[8px] text-zinc-400">{step.sampleId || '--'}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
          <span>Step {selectedStep + 1}</span>
          <span className="text-cyan-400">Micro offset: {selectedStepData.subTickOffset ?? 0}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[9px] text-zinc-400">
            <span>NOTE</span>
            <input
              value={selectedStepData.note || '---'}
              onChange={(event) => updateSelection({ note: event.target.value || '---' })}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-100 outline-none focus:border-cyan-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-[9px] text-zinc-400">
            <span>SAMPLE</span>
            <input
              value={selectedStepData.sampleId || '--'}
              onChange={(event) => updateSelection({ sampleId: event.target.value || '--' })}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-100 outline-none focus:border-cyan-500"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[9px] text-zinc-400">
            <span>Sub-step offset</span>
            <input
              type="range"
              min={0}
              max={7}
              value={selectedStepData.subTickOffset ?? 0}
              onChange={(event) => updateSelection({ subTickOffset: Number(event.target.value) })}
              className="accent-cyan-400"
            />
          </label>

          <label className="flex flex-col gap-1 text-[9px] text-zinc-400">
            <span>Velocity</span>
            <input
              type="range"
              min={0}
              max={127}
              value={selectedStepData.velocity ?? 127}
              onChange={(event) => updateSelection({ velocity: Number(event.target.value) })}
              className="accent-cyan-400"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default TrackerGrid;
