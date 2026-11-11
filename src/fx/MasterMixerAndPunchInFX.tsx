/**
 * SP-M8x Hybrid Music Production Suite
 * MasterMixerAndPunchInFX.tsx — Mixer & SP-404 Punch-In FX Macros
 */

import React, { useState } from 'react';
import { FXType } from './fxEngine';

export const MasterMixerAndPunchInFX: React.FC = () => {
  const [activeFx, setActiveFx] = useState<FXType>('none');
  const [masterVol, setMasterVol] = useState<number>(80);

  const fxPads: { id: FXType; label: string; color: string }[] = [
    { id: 'filter', label: 'LP FILTER', color: 'border-amber-500 text-amber-400 bg-amber-500/10' },
    { id: 'bitcrush', label: 'LO-FI CRUSH', color: 'border-rose-500 text-rose-400 bg-rose-500/10' },
    { id: 'delay', label: 'DELAY THROW', color: 'border-cyan-500 text-cyan-400 bg-cyan-500/10' },
  ];

  const handleFxToggle = (fxId: FXType) => {
    const nextFx = activeFx === fxId ? 'none' : fxId;
    setActiveFx(nextFx);
    console.log(`[SP-M8x FX] Punch-in macro activated: ${nextFx}`);
  };

  return (
    <div className="flex flex-col gap-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-2xl font-mono select-none">
      {/* Master Volume Section */}
      <div className="flex flex-col gap-2 pb-4 border-b border-zinc-800">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-zinc-400">MASTER VOLUME (HEADROOM LIMITER)</span>
          <span className="text-amber-400">{masterVol}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={masterVol}
          onChange={(e) => setMasterVol(Number(e.target.value))}
          className="w-full accent-amber-500 bg-zinc-950 h-2 rounded-lg cursor-pointer"
        />
      </div>

      {/* SP-404 Style Punch-In FX Pads */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-zinc-400 tracking-wider">
          PUNCH-IN PERFORMANCE MACROS (HOLD / TAP)
        </span>
        <div className="grid grid-cols-3 gap-3">
          {fxPads.map((fx) => {
            const isActive = activeFx === fx.id;
            return (
              <button
                key={fx.id}
                onPointerDown={() => handleFxToggle(fx.id)}
                className={`flex flex-col items-center justify-center h-24 rounded-xl border-2 transition-all duration-75 active:scale-95 shadow-lg ${
                  isActive
                    ? `${fx.color} scale-95 shadow-inner ring-2 ring-white/20`
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <span className="text-[10px] font-bold opacity-60">FX MACRO</span>
                <span className="text-xs font-black tracking-wider text-center mt-1">
                  {fx.label}
                </span>
                <div
                  className={`w-2 h-2 rounded-full mt-2 ${
                    isActive ? 'bg-current animate-ping' : 'bg-zinc-800'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};