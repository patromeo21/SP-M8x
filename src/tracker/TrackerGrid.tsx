/**
 * SP-M8x Hybrid Music Production Suite
 * TrackerGrid.tsx — Step Sequencer Grid Matrix View
 */

import React from 'react';
import { projectController } from '../project/projectController';
import { useStepDeletion } from './useStepDeletion';

export interface TrackerGridProps {
  patternId: string | number; // Accepts both string and number safely
  activeStep?: number;
}

export const TrackerGrid: React.FC<TrackerGridProps> = ({ patternId, activeStep = 0 }) => {
  const projectState = projectController.getState();
  
  // Resolve pattern index safely whether patternId is passed as a string or number
  const patternIndex = typeof patternId === 'number' ? patternId : parseInt(patternId, 10) || 0;
  const currentPattern = projectState.tracker.patterns[patternIndex] || projectState.tracker.patterns[0];
  const deletion = useStepDeletion((indices) => projectController.clearStepNotes(patternIndex, indices));

  const steps = currentPattern ? currentPattern.steps : [];

  return (
    <div className="flex flex-col gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl flex-1 font-mono select-none">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <h2 className="text-xs font-bold text-zinc-400">
          TRACKER MATRIX — {currentPattern ? currentPattern.name : `PATTERN ${patternId}`}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px]">{deletion.controls}</span>
          <span className="text-[10px] text-cyan-400 font-bold">{steps.length} STEPS</span>
        </div>
      </div>

      {/* Grid container for step sequencer cells */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 overflow-y-auto max-h-64 p-1">
        {steps.map((step, idx) => {
          const isActive = idx === activeStep;
          const hasNote = Boolean((step.note && step.note !== '---') || (step.sampleId && step.sampleId !== '--'));
          const isSelected = deletion.selected.has(idx);

          return (
            <button
              type="button"
              key={idx}
              aria-label={`Step ${idx + 1}: ${step.sampleId || 'empty'}. ${hasNote ? 'Tap to clear note' : 'Empty'}${isSelected ? ', selected for deletion' : ''}`}
              aria-pressed={isSelected}
              onPointerDown={(event) => deletion.onPointerDown(event, idx, hasNote)}
              onPointerCancel={() => deletion.onPointerCancel(idx)}
              onClick={() => {
                if (deletion.consumeClick(idx)) return;
                if (hasNote && window.confirm(`Clear the note on step ${idx + 1}?`)) {
                  projectController.clearStepNotes(patternIndex, [idx]);
                }
              }}
              className={`flex flex-col items-center justify-center p-2 rounded border text-[10px] transition-all ${
                isSelected
                  ? 'bg-rose-950 border-rose-400 text-rose-200'
                  : isActive
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                  : hasNote
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                  : 'bg-zinc-950/80 border-zinc-800/80 text-zinc-600'
              }`}
            >
              <span className="text-[8px] text-zinc-500 mb-0.5">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="font-bold tracking-wider">{step.note || '---'}</span>
              <span className="text-[8px] text-zinc-400 mt-0.5">{step.sampleId || '--'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TrackerGrid;