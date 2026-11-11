/**
 * SP-M8x FX Strip Workbench
 * FxStrip.tsx — Real-time touch controls for Punch-In and Master FX parameters
 */

import React, { useState } from 'react';
import { PunchInFXState, MasterFXState } from '../types';
import { fxEngine } from './fxEngine';

export const FxStrip: React.FC = () => {
  const [punchInState, setPunchInState] = useState<PunchInFXState>({
    filterCutoff: 20000,
    filterResonance: 1.0,
    delayTime: 0.375,
    delayFeedback: 0.3,
    reverbMix: 0.2,
    bitcrushBits: 16,
    vinylNoise: 0.0,
    isolatorLow: 1.0,
    isolatorMid: 1.0,
    isolatorHigh: 1.0,
  });

  const [masterState, setMasterState] = useState<MasterFXState>({
    limiterThreshold: -12,
    compressorRatio: 4,
    masterVolume: 0.8,
  });

  const handlePunchInChange = <K extends keyof PunchInFXState>(
    key: K,
    value: PunchInFXState[K]
  ) => {
    const updated = { ...punchInState, [key]: value };
    setPunchInState(updated);
    fxEngine.updatePunchInFX(updated);
  };

  const handleMasterChange = <K extends keyof MasterFXState>(
    key: K,
    value: MasterFXState[K]
  ) => {
    const updated = { ...masterState, [key]: value };
    setMasterState(updated);
    fxEngine.updateMasterFX(updated);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl font-mono text-zinc-200 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
        <div>
          <span className="text-xs text-zinc-500 uppercase tracking-wider">DSP Matrix</span>
          <h2 className="text-sm font-bold text-amber-400">Punch-In FX & Master Buss</h2>
        </div>
        <div className="text-[10px] bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 text-cyan-400">
          DSP Active (Low-CPU Mode)
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        {/* Punch-In FX Controls */}
        <div className="space-y-4 bg-zinc-950/40 p-4 rounded-lg border border-zinc-800/80">
          <div className="text-xs font-semibold text-zinc-400 border-b border-zinc-800 pb-1">
            Punch-In Live Processors
          </div>

          {/* Filter Cutoff */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Filter Cutoff</span>
              <span className="text-amber-400">{Math.round(punchInState.filterCutoff)} Hz</span>
            </div>
            <input
              type="range"
              min={100}
              max={20000}
              step={100}
              value={punchInState.filterCutoff}
              onChange={(e) => handlePunchInChange('filterCutoff', parseFloat(e.target.value))}
              className="w-full accent-amber-500 bg-zinc-800 rounded h-1 cursor-pointer"
            />
          </div>

          {/* Filter Resonance */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Resonance (Q)</span>
              <span className="text-amber-400">{punchInState.filterResonance.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={20}
              step={0.1}
              value={punchInState.filterResonance}
              onChange={(e) => handlePunchInChange('filterResonance', parseFloat(e.target.value))}
              className="w-full accent-amber-500 bg-zinc-800 rounded h-1 cursor-pointer"
            />
          </div>

          {/* Delay Feedback */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Delay Feedback</span>
              <span className="text-amber-400">{Math.round(punchInState.delayFeedback * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.95}
              step={0.01}
              value={punchInState.delayFeedback}
              onChange={(e) => handlePunchInChange('delayFeedback', parseFloat(e.target.value))}
              className="w-full accent-amber-500 bg-zinc-800 rounded h-1 cursor-pointer"
            />
          </div>
        </div>

        {/* Master Buss Controls */}
        <div className="space-y-4 bg-zinc-950/40 p-4 rounded-lg border border-zinc-800/80">
          <div className="text-xs font-semibold text-zinc-400 border-b border-zinc-800 pb-1">
            Master Dynamics & Limiters
          </div>

          {/* Limiter Threshold */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Limiter Threshold</span>
              <span className="text-cyan-400">{masterState.limiterThreshold} dB</span>
            </div>
            <input
              type="range"
              min={-24}
              max={0}
              step={1}
              value={masterState.limiterThreshold}
              onChange={(e) => handleMasterChange('limiterThreshold', parseFloat(e.target.value))}
              className="w-full accent-cyan-500 bg-zinc-800 rounded h-1 cursor-pointer"
            />
          </div>

          {/* Compressor Ratio */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Compression Ratio</span>
              <span className="text-cyan-400">{masterState.compressorRatio}:1</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={masterState.compressorRatio}
              onChange={(e) => handleMasterChange('compressorRatio', parseFloat(e.target.value))}
              className="w-full accent-cyan-500 bg-zinc-800 rounded h-1 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
