/**
 * SP-M8x Hybrid Music Production Suite
 * PadGrid.tsx — M8 Big Font Mode Sampler Pad Matrix (Banks A-D)
 */

import React, { useState } from 'react';
import { projectController } from '../project/projectController';

export interface PadGridProps {
  onTriggerPad?: (bank: string, padIndex: number) => void;
  onLoadSample?: (bank: string, padIndex: number, file: File) => void;
}

export const PadGrid: React.FC<PadGridProps> = ({ onTriggerPad, onLoadSample }) => {
  const [activeBank, setActiveBank] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [triggeredPad, setTriggeredPad] = useState<number | null>(null);

  // 16 pads per bank (4x4 grid configuration)
  const pads = Array.from({ length: 16 }, (_, i) => {
    const padNum = i + 1;
    const padId = `${activeBank}${padNum}`;
    return {
      id: padId,
      index: i,
      label: `PAD ${padNum < 10 ? '0' + padNum : padNum}`,
      sampleName: 'EMPTY', // Will reflect project state if bound
      hasSample: false,
    };
  });

  const handlePadPress = (index: number) => {
    setTriggeredPad(index);
    // Visual flash timeout for tactile feedback
    setTimeout(() => setTriggeredPad(null), 120);

    if (onTriggerPad) {
      onTriggerPad(activeBank, index);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file && onLoadSample) {
      onLoadSample(activeBank, index, file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 font-mono select-none shadow-xl">
      
      {/* Header & Bank Selector Controls */}
      <div className="flex items-center justify-between border-b border-[var(--border-grid)] pb-2 mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-extrabold tracking-widest text-[var(--accent-phrase)]">
            SAMPLER PADS
          </span>
          <span className="text-[9px] bg-cyan-950 text-[var(--accent-phrase)] border border-cyan-500/40 px-1.5 py-0.5 rounded font-bold">
            SEL: BANK {activeBank}
          </span>
        </div>

        {/* Bank Toggles (A, B, C, D) */}
        <div className="flex space-x-1 bg-zinc-950 p-1 rounded border border-[var(--border-grid)]">
          {(['A', 'B', 'C', 'D'] as const).map((bank) => (
            <button
              key={bank}
              onClick={() => setActiveBank(bank)}
              className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${
                activeBank === bank
                  ? 'bg-[var(--accent-phrase)] text-zinc-950 shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {bank}
            </button>
          ))}
        </div>
      </div>

      {/* 4x4 Pad Grid Matrix */}
      <div className="grid grid-cols-4 gap-2 flex-1">
        {pads.map((pad, idx) => {
          const isTriggered = triggeredPad === idx;

          return (
            <div
              key={pad.id}
              onClick={() => handlePadPress(idx)}
              className={`relative flex flex-col items-center justify-between p-2 rounded-lg border cursor-pointer transition-all duration-75 select-none ${
                isTriggered
                  ? 'bg-[var(--accent-phrase)] border-[var(--accent-phrase)] text-zinc-950 scale-95 shadow-[0_0_12px_rgba(34,211,238,0.7)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              {/* Pad Identification Tag */}
              <div className="w-full flex justify-between items-center text-[8px]">
                <span className={`font-bold ${isTriggered ? 'text-zinc-900' : 'text-zinc-500'}`}>
                  {pad.id}
                </span>
                {/* Hidden file input overlay for loading audio directly to pad */}
                <label 
                  onClick={(e) => e.stopPropagation()} 
                  className="cursor-pointer text-[7px] text-zinc-500 hover:text-[var(--accent-phrase)] underline"
                >
                  LOAD
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, idx)}
                  />
                </label>
              </div>

              {/* Center Sample Label / Status */}
              <div className="my-auto text-center">
                <span className={`text-[10px] font-extrabold tracking-wider truncate block max-w-[70px] ${
                  isTriggered ? 'text-zinc-950' : pad.hasSample ? 'text-zinc-100' : 'text-zinc-600'
                }`}>
                  {pad.hasSample ? pad.sampleName : 'EMPTY'}
                </span>
              </div>

              {/* Bottom Indicator Bar */}
              <div className={`w-full h-1 rounded-full mt-1 ${
                isTriggered ? 'bg-zinc-950' : pad.hasSample ? 'bg-[var(--accent-phrase)]' : 'bg-zinc-800'
              }`} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PadGrid;