/**
 * SP-M8x Hybrid Music Production Suite
 * TrackerGrid.tsx — Step Sequencer Grid Matrix View
 */

import React from 'react';
import { projectController } from '../project/projectController';

export interface TrackerGridProps {
  patternId: string | number;
  activeStep?: number;
}

export const TrackerGrid: React.FC<TrackerGridProps> = ({ patternId, activeStep = 0 }) => {
  const projectState = projectController.getState();

  const patternIndex = typeof patternId === 'number' ? patternId : parseInt(patternId, 10) || 0;
  const currentPattern = projectState.tracker.patterns[patternIndex] || projectState.tracker.patterns[0];
  const stepCount = Math.min(currentPattern?.steps.length ?? 16, 16);
  const steps = currentPattern ? currentPattern.steps.slice(0, stepCount) : [];

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
          const isActive = idx === activeStep;
          const hasNote = step.note && step.note !== '---';

          return (
            <div
              key={idx}
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
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TrackerGrid;
