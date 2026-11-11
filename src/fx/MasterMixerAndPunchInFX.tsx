/**
 * SP-M8x Hybrid Music Production Suite
 * MasterMixerAndPunchInFX.tsx — Master Volume, Dynamics, & SP-404 Style Punch-In FX Panel
 */

import React, { useState } from 'react';
import { projectController } from '../project/projectController';

interface PunchInEffect {
  id: string;
  name: string;
  category: 'filter' | 'time' | 'texture' | 'modulation';
  color: string;
}

const PUNCH_IN_FX: PunchInEffect[] = [
  { id: 'isolator', name: 'ISOLATOR EQ', category: 'filter', color: 'cyan' },
  { id: 'lofi', name: 'LO-FI / SP303', category: 'texture', color: 'amber' },
  { id: 'delay', name: 'PING PONG', category: 'time', color: 'emerald' },
  { id: 'reverb', name: 'SPACE VERB', category: 'time', color: 'purple' },
  { id: 'stutter', name: 'STUTTER 1/4', category: 'modulation', color: 'rose' },
  { id: 'vinyl', name: 'VINYL SIM', category: 'texture', color: 'blue' },
];

interface MasterMixerProps {
  onMasterVolumeChange?: (volume: number) => void;
  onFxToggle?: (fxId: string, active: boolean) => void;
}

export const MasterMixerAndPunchInFX: React.FC<MasterMixerProps> = ({
  onMasterVolumeChange,
  onFxToggle,
}) => {
  const projectState = projectController.getState();
  const [masterVolume, setMasterVolume] = useState<number>(0.85);
  const [limiterEnabled, setLimiterEnabled] = useState<boolean>(true);
  const [activeFx, setActiveFx] = useState<Record<string, boolean>>({});
  const [fxParam, setFxParam] = useState<number>(50); // Macro parameter control (0-100)

  const handleVolumeSlider = (val: number) => {
    setMasterVolume(val);
    onMasterVolumeChange?.(val);
  };

  const toggleFx = (id: string) => {
    const nextState = !activeFx[id];
    setActiveFx((prev) => ({ ...prev, [id]: nextState }));
    onFxToggle?.(id, nextState);
  };

  return (
    <div className="flex flex-col bg-zinc-950 text-zinc-100 font-mono rounded-xl border border-zinc-800 p-4 shadow-2xl gap-5">
      {/* Section 1: Master Mixer Strip */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold tracking-wider text-zinc-300">MASTER BUS</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-end">
          {/* Limiter Toggle */}
          <button
            onClick={() => setLimiterEnabled(!limiterEnabled)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-all ${
              limiterEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-zinc-900 text-zinc-500 border-zinc-800'
            }`}
          >
            PEAK LIMITER: {limiterEnabled ? 'ON' : 'OFF'}
          </button>

          {/* Master Volume Slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">VOL: {Math.round(masterVolume * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => handleVolumeSlider(parseFloat(e.target.value))}
              className="w-32 accent-amber-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Section 2: SP-404 Style Punch-In FX Pads */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400 tracking-wider">PUNCH-IN PERFORMANCE FX</span>
          <span className="text-[10px] text-zinc-500">TAP TO HOLD / PRESS TO LATCH</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PUNCH_IN_FX.map((fx) => {
            const isActive = Boolean(activeFx[fx.id]);

            return (
              <button
                key={fx.id}
                onMouseDown={() => toggleFx(fx.id)}
                onTouchStart={() => toggleFx(fx.id)}
                className={`flex flex-col justify-between h-20 p-3 rounded-xl border text-left transition-all active:scale-95 ${
                  isActive
                    ? 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-lg shadow-amber-500/10 ring-2 ring-amber-500/30'
                    : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">{fx.category}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isActive ? 'bg-amber-400 animate-ping' : 'bg-zinc-700'
                    }`}
                  />
                </div>
                <div className="text-xs font-extrabold tracking-wide">{fx.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Macro Control Bar */}
      <div className="flex items-center gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/60 text-xs">
        <span className="text-zinc-400 font-semibold">FX MACRO CTRL</span>
        <input
          type="range"
          min="0"
          max="100"
          value={fxParam}
          onChange={(e) => setFxParam(parseInt(e.target.value, 10))}
          className="flex-1 accent-cyan-400 cursor-pointer"
        />
        <span className="text-cyan-400 font-bold w-8 text-right">{fxParam}%</span>
      </div>
    </div>
  );
};
