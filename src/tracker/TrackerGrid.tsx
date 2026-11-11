/**
 * SP-M8x Hybrid Music Production Suite
 * TrackerGrid.tsx — M8-Style Tracker Grid with Memoized Cells & Pointer Events
 * Located in src/tracker/TrackerGrid.tsx
 */

import React, { memo, useCallback } from 'react';

interface TrackerStepCellProps {
  stepIndex: number;
  isActivePlayhead: boolean;
  stepData?: { note: string; instrument: string; volume: string };
  onStepSelect: (step: number) => void;
}

// Memoized individual step cell to eliminate cascade re-renders across 64 steps
const TrackerStepCell = memo<TrackerStepCellProps>(
  ({ stepIndex, isActivePlayhead, stepData, onStepSelect }) => {
    return (
      <div
        onPointerDown={() => onStepSelect(stepIndex)}
        className={`flex items-center justify-between px-2 py-1.5 text-xs font-mono border-b border-zinc-900 transition-colors cursor-pointer select-none ${
          isActivePlayhead
            ? 'bg-amber-500/20 border-l-2 border-l-amber-400 text-amber-300'
            : stepIndex % 4 === 0
            ? 'bg-zinc-900/60 text-zinc-300'
            : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-900/40'
        }`}
      >
        <span className="text-zinc-600 font-bold w-6">
          {String(stepIndex + 1).padStart(2, '0')}
        </span>
        <span className="tracking-widest font-bold">
          {stepData?.note ?? '---'}
        </span>
        <span className="text-cyan-400">
          {stepData?.instrument ?? '--'}
        </span>
        <span className="text-amber-400">
          {stepData?.volume ?? '--'}
        </span>
      </div>
    );
  },
  (prev, next) =>
    prev.isActivePlayhead === next.isActivePlayhead &&
    prev.stepIndex === next.stepIndex &&
    prev.stepData?.note === next.stepData?.note &&
    prev.stepData?.instrument === next.stepData?.instrument &&
    prev.stepData?.volume === next.stepData?.volume
);

TrackerStepCell.displayName = 'TrackerStepCell';

interface TrackerGridProps {
  patternId?: string;
  currentStepIndex: number;
  onStepSelect: (step: number) => void;
}

export const TrackerGrid: React.FC<TrackerGridProps> = ({
  currentStepIndex,
  onStepSelect,
}) => {
  const handleStepSelect = useCallback(
    (step: number) => {
      onStepSelect(step);
    },
    [onStepSelect]
  );

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Tracker Column Headers */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 text-[10px] font-bold text-zinc-400 border-b border-zinc-800 uppercase tracking-wider">
        <span>Stp</span>
        <span>Note</span>
        <span>Ins</span>
        <span>Vol</span>
      </div>

      {/* 64-Step Scrollable Tracker View */}
      <div className="flex flex-col max-h-[380px] overflow-y-auto overscroll-contain">
        {Array.from({ length: 64 }).map((_, index) => (
          <TrackerStepCell
            key={index}
            stepIndex={index}
            isActivePlayhead={currentStepIndex === index}
            onStepSelect={handleStepSelect}
          />
        ))}
      </div>
    </div>
  );
};