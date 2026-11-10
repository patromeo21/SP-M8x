/**
 * SP-M8x Sampler Workspace
 * PadGrid.tsx — 16-Pad Performance Grid with MPC Chromatic & Sample Trigger support
 */

import React, { useState } from 'react';
import { Pad, SamplerMode, BankId } from '../types';
import { audioEngine } from '../audioEngine';

interface PadGridProps {
  pads: Pad[];
  mode: SamplerMode;
  activeBank: BankId;
  onPadSelect: (padId: number) => void;
  selectedPadId: number;
}

export const PadGrid: React.FC<PadGridProps> = ({
  pads,
  mode,
  activeBank,
  onPadSelect,
  selectedPadId,
}) => {
  const [triggeredPads, setTriggeredPads] = useState<Record<number, boolean>>({});

  // Handle pad trigger for mobile touch and desktop click
  const handlePadTrigger = async (padId: number) => {
    await audioEngine.init();

    // If in MPC Chromatic mode, calculate semitone offset across the 16 pads
    const semitoneOffset = mode === 'MPC_CHROMATIC' ? padId - 8 : 0;

    // Fixed array lookup using .find() instead of direct callback indexing
    const pad = pads.find((p) => p.id === padId) || pads[padId];
    if (!pad) return;

    audioEngine.triggerPad(padId, {
      sliceStart: pad.sliceStart,
      sliceEnd: pad.sliceEnd,
      volume: pad.volume,
      semitoneOffset: mode === 'MPC_CHROMATIC' ? semitoneOffset + (pad.pitchOffset || 0) : pad.pitchOffset || 0,
      loop: pad.loop,
    });

    // Visual trigger state
    setTriggeredPads((prev) => ({ ...prev, [padId]: true }));
    setTimeout(() => {
      setTriggeredPads((prev) => ({ ...prev, [padId]: false }));
    }, 120);

    onPadSelect(padId);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl">
      {/* Header bar indicating current mode and bank */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Bank <strong className="text-amber-400">{activeBank}</strong>
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Mode: <strong className="text-cyan-400">{mode.replace('_', ' ')}</strong>
          </span>
        </div>
        <div className="text-xs font-mono text-zinc-500">
          16-Pad Matrix (A13 Optimized)
        </div>
      </div>

      {/* 4x4 Pad Grid Matrix */}
      <div className="grid grid-cols-4 gap-3 flex-1 min-h-[320px]">
        {pads.slice(0, 16).map((pad, index) => {
          const isSelected = selectedPadId === pad.id;
          const isTriggered = triggeredPads[pad.id];
          const hasBuffer = !!pad.buffer;

          return (
            <button
              key={pad.id}
              type="button"
              onPointerDown={() => handlePadTrigger(pad.id)}
              className={`
                relative flex flex-col justify-between p-3 rounded-lg border font-mono transition-all duration-75
                touch-none select-none focus:outline-none
                ${
                  isTriggered
                    ? 'bg-amber-500 border-amber-300 text-zinc-950 scale-[0.98] shadow-inner shadow-amber-900'
                    : isSelected
                    ? 'bg-zinc-800 border-amber-500/80 text-zinc-100 shadow-lg shadow-zinc-950'
                    : hasBuffer
                    ? 'bg-zinc-800/80 border-zinc-700 text-zinc-200 hover:border-zinc-500'
                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-600 hover:border-zinc-700'
                }
              `}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs opacity-70 font-semibold">
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                {hasBuffer && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>

              <div className="text-left my-auto truncate w-full">
                <div className="text-xs font-bold truncate">
                  {pad.name || `Pad ${index + 1}`}
                </div>
                {mode === 'MPC_CHROMATIC' && (
                  <div className="text-[10px] opacity-60">
                    {index - 8 >= 0 ? `+${index - 8}` : index - 8} st
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] opacity-50 w-full pt-1 border-t border-white/5">
                <span>{pad.reverse ? 'REV' : 'FWD'}</span>
                <span>{Math.round(pad.volume * 100)}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
