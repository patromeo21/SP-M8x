/**
 * SP-M8x Hybrid Music Production Suite
 * FxStrip.tsx — Effects Strip & Punch-In Control Interface
 */

import React, { useState, useEffect } from 'react';
import { projectController } from '../project/projectController';
import { fxEngine } from './fxEngine';

export const FxStrip: React.FC = () => {
  const [projectState, setProjectState] = useState(() => projectController.getState());
  const [activeEffect, setActiveEffect] = useState<string>('FILTER');

  useEffect(() => {
    const unsubscribe = projectController.subscribe((newState) => {
      setProjectState(newState);
    });
    return () => unsubscribe();
  }, []);

  const stateRecord = projectState as unknown as Record<string, any>;
  const masterVolume = stateRecord.effects?.master?.masterVolume ?? 0.8;
  const filterCutoff = stateRecord.effects?.master?.filterCutoff ?? 20000;
  const bitCrushDepth = stateRecord.effects?.master?.bitCrushDepth ?? 16;

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    projectController.setMasterVolume(val);
    fxEngine.setMasterVolume(val);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    fxEngine.setFilterCutoff(val);
  };

  const handleBitCrushChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    fxEngine.setBitCrushDepth(val);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl font-mono select-none">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h2 className="text-xs font-bold text-cyan-400">FX STRIP & MASTER MIXER</h2>
        <div className="flex items-center gap-1">
          {['FILTER', 'CRUSH', 'DELAY'].map((fx) => (
            <button
              key={fx}
              type="button"
              onPointerDown={() => setActiveEffect(fx)}
              className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all active:scale-95 ${
                activeEffect === fx
                  ? 'bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-500/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {fx}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Master Volume */}
        <div className="flex flex-col gap-2 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg">
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>MASTER VOL</span>
            <span className="text-cyan-400 font-bold">{Math.round(masterVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={handleVolumeChange}
            className="w-full accent-cyan-500 bg-zinc-800 rounded-lg h-2 cursor-pointer"
          />
        </div>

        {/* Filter Cutoff */}
        <div className="flex flex-col gap-2 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg">
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>FILTER CUTOFF</span>
            <span className="text-cyan-400 font-bold">{Math.round(filterCutoff)} Hz</span>
          </div>
          <input
            type="range"
            min="100"
            max="20000"
            step="100"
            value={filterCutoff}
            onChange={handleFilterChange}
            className="w-full accent-cyan-500 bg-zinc-800 rounded-lg h-2 cursor-pointer"
          />
        </div>

        {/* Bitcrush Resolution */}
        <div className="flex flex-col gap-2 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg">
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>BIT CRUSH</span>
            <span className="text-cyan-400 font-bold">{bitCrushDepth} BIT</span>
          </div>
          <input
            type="range"
            min="4"
            max="16"
            step="1"
            value={bitCrushDepth}
            onChange={handleBitCrushChange}
            className="w-full accent-cyan-500 bg-zinc-800 rounded-lg h-2 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

export default FxStrip;