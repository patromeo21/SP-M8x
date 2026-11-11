/**
 * SP-M8x Hybrid Music Production Suite
 * TrackerGrid.tsx — M8-Style Tracker Grid Component with Micro-Timing Sub-Tick Display
 */

import React from 'react';
import { projectController } from '../project/projectController';
import { selectPatternById } from '../project/trackerSelectors';
import type { TrackerStepItem } from '../project/projectTypes';

interface TrackerGridProps {
  patternId?: string; // Optional — defaults to first pattern if omitted
  currentStepIndex?: number;
  onStepSelect?: (stepIndex: number) => void;
}

export const TrackerGrid: React.FC<TrackerGridProps> = ({
  patternId,
  currentStepIndex = -1,
  onStepSelect,
}) => {
  const projectState = projectController.getState();
  const targetPatternId = patternId ?? projectState.tracker.patterns[0]?.id ?? 'pattern-00';
  const pattern = selectPatternById(projectState, targetPatternId);

  if (!pattern) {
    return (
      <div className="p-4 bg-zinc-900 text-zinc-400 font-mono text-sm rounded-lg border border-zinc-800">
        No tracker patterns found in project.
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-zinc-950 text-zinc-100 font-mono rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
      {/* Grid Header */}
      <div className="flex items-center bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-400 border-b border-zinc-800 tracking-wider">
        <div className="w-12 text-center">STEP</div>
        <div className="w-16 text-center">NOTE</div>
        <div className="w-12 text-center">SUB</div>
        <div className="w-16 text-center">VEL</div>
        <div className="w-24 text-center">INST</div>
        <div className="w-20 text-center">FX</div>
        <div className="flex-1 text-left px-2">TABLE / STATUS</div>
      </div>

      {/* Grid Rows Scroll Container */}
      <div className="max-h-[400px] overflow-y-auto divide-y divide-zinc-900/50">
        {pattern.steps.map((step: TrackerStepItem) => {
          const isCurrent = step.stepIndex === currentStepIndex;
          const hasMicroTiming = step.subTickOffset > 0;

          return (
            <div
              key={step.id}
              onClick={() => onStepSelect?.(step.stepIndex)}
              className={`flex items-center px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                isCurrent
                  ? 'bg-amber-500/20 text-amber-300 font-bold border-l-2 border-amber-500'
                  : 'hover:bg-zinc-900/80 text-zinc-300'
              }`}
            >
              {/* Step Index */}
              <div className="w-12 text-center text-zinc-500">
                {String(step.stepIndex).padStart(2, '0')}
              </div>

              {/* Note */}
              <div className={`w-16 text-center font-bold ${step.note !== '---' ? 'text-cyan-400' : 'text-zinc-600'}`}>
                {step.note}
              </div>

              {/* Sub-Tick Micro-Timing Offset */}
              <div className={`w-12 text-center ${hasMicroTiming ? 'text-emerald-400 font-bold' : 'text-zinc-600'}`}>
                {step.subTickOffset > 0 ? `+${step.subTickOffset}` : '-'}
              </div>

              {/* Velocity */}
              <div className="w-16 text-center text-zinc-400">
                {step.velocity}
              </div>

              {/* Instrument Assignment */}
              <div className="w-24 text-center text-zinc-400 truncate">
                {step.instrumentAssignmentId ? step.instrumentAssignmentId.replace('assignment-', '') : '--'}
              </div>

              {/* Phrase FX */}
              <div className="w-20 text-center text-amber-400/90">
                {step.phraseFx !== '--' ? `${step.phraseFx} ${step.phraseFxValue}` : '--'}
              </div>

              {/* Table FX / Extra */}
              <div className="flex-1 text-left px-2 text-zinc-500 truncate">
                {step.tableFx !== '--' ? `Tbl: ${step.tableFx}` : '---'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
