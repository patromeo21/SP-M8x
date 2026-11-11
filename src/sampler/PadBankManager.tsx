/**
 * SP-M8x Hybrid Music Production Suite
 * PadBankManager.tsx — 4x4 Sampler Pad Bank with Pointer Event Optimization
 */

import React, { useState } from 'react';
import { projectController } from '../project/projectController';

export const PadBankManager: React.FC = () => {
  const [activeBank, setActiveBank] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [triggeredPad, setTriggeredPad] = useState<number | null>(null);

  const projectState = projectController.getState();
  const samplerState = projectState.sampler;

  // Handle high-performance touch/pointer trigger
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, padIndex: number) => {
    // Capture pointer to guarantee pointerUp fires reliably even if finger drifts off element
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback if capture fails on specific legacy touch boundaries
    }

    setTriggeredPad(padIndex);

    // Trigger audio engine playback for this pad slot
    const padId = `${activeBank}-${padIndex + 1}`;
    console.log(`[SP-M8x] Triggering Sampler Pad: ${padId}`);
    // audioEngine.triggerPad(padId);
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release errors
    }
    setTriggeredPad(null);
  };

  return (
    <div className="flex flex-col gap-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-2xl">
      {/* Bank Selector Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-zinc-400">BANK:</span>
          <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            {(['A', 'B', 'C', 'D'] as const).map((bank) => (
              <button
                key={bank}
                onPointerDown={() => setActiveBank(bank)}
                className={`px-3 py-1 text-xs font-extrabold rounded transition-all ${
                  activeBank === bank
                    ? 'bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {bank}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-zinc-400 font-mono">
          MODE: <span className="text-amber-400 font-bold">POLY / CHOP</span>
        </div>
      </div>

      {/* 4x4 Pad Grid */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 16 }).map((_, index) => {
          const isPressed = triggeredPad === index;
          const padNumber = index + 1;
          const displayNum = `${activeBank}${padNumber < 10 ? '0' + padNumber : padNumber}`;

          return (
            <button
              key={index}
              onPointerDown={(e) => handlePointerDown(e, index)}
              onPointerUp={handlePointerUpOrCancel}
              onPointerCancel={handlePointerUpOrCancel}
              className={`relative flex flex-col items-center justify-center h-20 rounded-xl border transition-all duration-75 select-none ${
                isPressed
                  ? 'bg-cyan-400 text-zinc-950 border-cyan-300 scale-95 shadow-inner shadow-cyan-900/50'
                  : 'bg-zinc-950 text-zinc-200 border-zinc-800 hover:border-zinc-700 active:scale-95 shadow-lg'
              }`}
            >
              <span className="text-[10px] opacity-60 font-bold">PAD</span>
              <span className="text-sm font-black tracking-tight">{displayNum}</span>
              <div
                className={`absolute bottom-1.5 w-1.5 h-1.5 rounded-full ${
                  isPressed ? 'bg-zinc-950 animate-ping' : 'bg-zinc-800'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};