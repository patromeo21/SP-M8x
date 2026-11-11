/**
 * SP-M8x Hybrid Music Production Suite
 * SamplerWorkbench.tsx — Sample Chopping & Waveform Editor Workbench
 */

import React, { useState } from 'react';
import { audioEngine } from '../audio/audioEngine';

interface SamplerWorkbenchProps {
  selectedPadId?: string;
  selectedPad?: any;
  onUpdatePad?: (updatedPad: any) => void;
  onTriggerPad?: (padId: number) => Promise<void>;
}

export const SamplerWorkbench: React.FC<SamplerWorkbenchProps> = ({
  selectedPadId = 'A1',
  selectedPad,
  onUpdatePad,
  onTriggerPad,
}) => {
  const [startPoint, setStartPoint] = useState<number>(0);
  const [endPoint, setEndPoint] = useState<number>(100);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  const activePadLabel = selectedPad?.id || selectedPadId;

  const handlePreviewSlice = async () => {
    console.log(`[SamplerWorkbench] Previewing slice for Pad ${activePadLabel} [${startPoint}% - ${endPoint}%]`);
    if (onTriggerPad) {
      const numericId = typeof activePadLabel === 'number' ? activePadLabel : parseInt(String(activePadLabel).replace(/\D/g, ''), 10) || 1;
      await onTriggerPad(numericId);
    } else {
      audioEngine.triggerVoice(String(activePadLabel));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl font-mono select-none">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-xs font-bold text-cyan-400">SAMPLE WORKBENCH & CHOPPER</h2>
          <p className="text-[10px] text-zinc-500">
            Active Target: <span className="text-cyan-400 font-bold">{activePadLabel}</span>
            {selectedPad?.name && <span className="ml-2 text-zinc-400">({selectedPad.name})</span>}
          </p>
        </div>

        <button
          type="button"
          onPointerDown={() => setIsLooping(!isLooping)}
          className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all active:scale-95 ${
            isLooping ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          LOOP: {isLooping ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Waveform Display Box */}
      <div className="relative h-36 bg-zinc-950/80 border border-zinc-800 rounded-xl flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-1 bg-zinc-800 flex items-center justify-between px-4">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
            <span className="text-[10px] text-zinc-600 tracking-widest">WAVEFORM DENSITY STREAM</span>
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
          </div>
        </div>
        <span className="z-10 text-[10px] text-zinc-500 bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800">
          Drop Audio Sample or Record via Line-In
        </span>
      </div>

      {/* Chop & Range Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg">
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>START POINT</span>
            <span className="text-cyan-400 font-bold">{startPoint}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="95"
            value={startPoint}
            onChange={(e) => setStartPoint(Number(e.target.value))}
            className="w-full accent-cyan-500 bg-zinc-800 rounded-lg h-2 cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-2 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg">
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>END POINT</span>
            <span className="text-cyan-400 font-bold">{endPoint}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            value={endPoint}
            onChange={(e) => setEndPoint(Number(e.target.value))}
            className="w-full accent-cyan-500 bg-zinc-800 rounded-lg h-2 cursor-pointer"
          />
        </div>
      </div>

      {/* Action Trigger */}
      <button
        type="button"
        onPointerDown={handlePreviewSlice}
        className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold text-xs rounded-xl transition-all active:scale-95 shadow-lg shadow-cyan-900/30"
      >
        PREVIEW SLICE RANGE
      </button>
    </div>
  );
};

export default SamplerWorkbench;