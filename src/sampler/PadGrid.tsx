/**
 * SP-M8x Hybrid Music Production Suite
 * PadGrid.tsx — M8 Big Font Mode Sampler Pad Matrix (Banks A-D)
 */

import React, { useState } from 'react';

export interface PadGridProps {
  pads?: Array<{ id: string | number; index?: number; label?: string; sampleName?: string; hasSample?: boolean; [key: string]: any }>;
  mode?: string;
  activeBank?: string;
  onPadSelect?: (index: number) => void | React.Dispatch<React.SetStateAction<number>>;
  selectedPadId?: number;
  onTriggerPad?: (bank: string, padIndex: number) => void;
  onLoadSample?: (bank: string, padIndex: number, file: File) => void;
}

export const PadGrid: React.FC<PadGridProps> = ({
  pads: externalPads,
  mode,
  activeBank: externalBank = 'A',
  onPadSelect,
  selectedPadId = 0,
  onTriggerPad,
  onLoadSample,
}) => {
  const [internalBank, setInternalBank] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [triggeredPad, setTriggeredPad] = useState<number | null>(null);

  const activeBank = externalBank || internalBank;

  // Fallback pads if none passed externally
  const defaultPads = Array.from({ length: 16 }, (_, i) => {
    const padNum = i + 1;
    const padId = `${activeBank}${padNum}`;
    return {
      id: padId,
      index: i,
      label: `PAD ${padNum < 10 ? '0' + padNum : padNum}`,
      sampleName: 'EMPTY',
      hasSample: false,
    };
  });

  const padsToDisplay = externalPads || defaultPads;

  const handlePadClick = (index: number) => {
    setTriggeredPad(index);
    setTimeout(() => setTriggeredPad(null), 120);

    if (onPadSelect) {
      onPadSelect(index);
    }
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
            SAMPLER PADS {mode ? `(${mode.toUpperCase()})` : ''}
          </span>
          <span className="text-[9px] bg-cyan-950 text-[var(--accent-phrase)] border border-cyan-500/40 px-1.5 py-0.5 rounded font-bold">
            BANK {activeBank}
          </span>
        </div>
      </div>

      {/* 4x4 Pad Grid Matrix */}
      <div className="grid grid-cols-4 gap-2 flex-1">
        {padsToDisplay.map((pad, idx) => {
          const isTriggered = triggeredPad === idx;
          const isSelected = selectedPadId === idx;
          const displayLabel = pad.sampleName || pad.label || `PAD ${idx + 1}`;
          const padDisplayId = String(pad.id ?? `${activeBank}${idx + 1}`);

          return (
            <div
              key={pad.id ?? idx}
              onClick={() => handlePadClick(idx)}
              className={`relative flex flex-col items-center justify-between p-2 rounded-lg border cursor-pointer transition-all duration-75 select-none ${
                isTriggered
                  ? 'bg-[var(--accent-phrase)] border-[var(--accent-phrase)] text-zinc-950 scale-95 shadow-[0_0_12px_rgba(34,211,238,0.7)]'
                  : isSelected
                  ? 'bg-zinc-900 border-[var(--accent-phrase)] text-zinc-100 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              {/* Pad Identification Tag */}
              <div className="w-full flex justify-between items-center text-[8px]">
                <span className={`font-bold ${isTriggered ? 'text-zinc-900' : 'text-zinc-500'}`}>
                  {padDisplayId}
                </span>
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
                  {displayLabel}
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