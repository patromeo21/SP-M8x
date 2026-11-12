/**
 * SP-M8x Hybrid Music Production Suite
 * SamplerWorkbench.tsx — M8 Big Font Mode Waveform / Slicing Workbench
 */

import React, { useState } from 'react';

export interface SamplerWorkbenchProps {
  sampleName?: string;
  sampleDuration?: number; // in seconds
  sampleRate?: number;    // e.g., 44100
  startPoint?: number;    // 0 - 100%
  endPoint?: number;      // 0 - 100%
  pitchShift?: number;    // semitones (-12 to +12)
  onParameterChange?: (param: string, value: number) => void;
}

export const SamplerWorkbench: React.FC<SamplerWorkbenchProps> = ({
  sampleName = 'NO SAMPLE LOADED',
  sampleDuration = 0.0,
  sampleRate = 44100,
  startPoint = 0,
  endPoint = 100,
  pitchShift = 0,
  onParameterChange,
}) => {
  const [start, setStart] = useState<number>(startPoint);
  const [end, setEnd] = useState<number>(endPoint);
  const [pitch, setPitch] = useState<number>(pitchShift);

  const handleStartChange = (val: number) => {
    setStart(val);
    if (onParameterChange) onParameterChange('start', val);
  };

  const handleEndChange = (val: number) => {
    setEnd(val);
    if (onParameterChange) onParameterChange('end', val);
  };

  const handlePitchChange = (val: number) => {
    setPitch(val);
    if (onParameterChange) onParameterChange('pitch', val);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 font-mono select-none shadow-xl">
      
      {/* Workbench Header & Telemetry */}
      <div className="flex items-center justify-between border-b border-[var(--border-grid)] pb-2 mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-extrabold tracking-widest text-[var(--accent-table)] drop-shadow-[0_0_8px_rgba(192,132,252,0.3)]">
            SAMPLER WORKBENCH
          </span>
          <span className="text-[9px] bg-purple-950 text-[var(--accent-table)] border border-purple-500/40 px-1.5 py-0.5 rounded font-bold">
            EDIT & SLICE
          </span>
        </div>
        <div className="text-[9px] text-zinc-400">
          RATE: <strong className="text-zinc-200">{sampleRate}HZ</strong>
        </div>
      </div>

      {/* Waveform Display Canvas Scaffold */}
      <div className="relative flex flex-col items-center justify-center h-28 bg-zinc-950 border border-zinc-800 rounded-lg p-2 mb-3 overflow-hidden group">
        {/* Simulated Waveform Grid Lines */}
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-4 pointer-events-none opacity-20">
          {Array.from({ length: 32 }).map((_, i) => (
            <div key={i} className="border-[0.5px] border-zinc-700/40" />
          ))}
        </div>

        {/* Center Sample Name / Status */}
        <span className="text-xs font-black tracking-wider text-zinc-300 z-10 truncate max-w-[220px]">
          {sampleName}
        </span>

        {/* Waveform Visualizer Placeholder Bars */}
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between h-10 gap-0.5 pointer-events-none">
          {Array.from({ length: 36 }).map((_, i) => {
            const heightFactor = Math.sin(i * 0.4) * 50 + 50;
            return (
              <div 
                key={i} 
                className="w-1 bg-[var(--accent-table)] opacity-70 rounded-t"
                style={{ height: `${Math.max(15, heightFactor)}%` }}
              />
            );
          })}
        </div>

        {/* Duration / Telemetry Footer inside screen */}
        <div className="absolute top-1.5 left-2 text-[8px] text-purple-400 font-bold">
          DUR: {sampleDuration.toFixed(2)}S
        </div>
      </div>

      {/* Parameter Control Sliders (Start, End, Pitch) */}
      <div className="grid grid-cols-3 gap-2 mt-auto">
        {/* Start Point */}
        <div className="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded p-1.5">
          <div className="flex justify-between text-[8px] mb-1">
            <span className="text-zinc-400 font-bold">START</span>
            <span className="text-[var(--accent-table)]">{start}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={start}
            onChange={(e) => handleStartChange(Number(e.target.value))}
            className="w-full accent-[var(--accent-table)] cursor-pointer h-1 bg-zinc-800 rounded"
          />
        </div>

        {/* End Point */}
        <div className="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded p-1.5">
          <div className="flex justify-between text-[8px] mb-1">
            <span className="text-zinc-400 font-bold">END</span>
            <span className="text-[var(--accent-table)]">{end}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={end}
            onChange={(e) => handleEndChange(Number(e.target.value))}
            className="w-full accent-[var(--accent-table)] cursor-pointer h-1 bg-zinc-800 rounded"
          />
        </div>

        {/* Pitch Shift */}
        <div className="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded p-1.5">
          <div className="flex justify-between text-[8px] mb-1">
            <span className="text-zinc-400 font-bold">PITCH</span>
            <span className="text-[var(--accent-table)]">{pitch > 0 ? `+${pitch}` : pitch}ST</span>
          </div>
          <input
            type="range"
            min={-12}
            max={12}
            value={pitch}
            onChange={(e) => handlePitchChange(Number(e.target.value))}
            className="w-full accent-[var(--accent-table)] cursor-pointer h-1 bg-zinc-800 rounded"
          />
        </div>
      </div>

    </div>
  );
};

export default SamplerWorkbench;