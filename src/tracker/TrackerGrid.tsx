/**
 * SP-M8x M8 Tracker Grid View
 * TrackerGrid.tsx — Vertical pattern step editor and playback display
 */

import React, { useEffect, useState } from 'react';
import { TrackerPattern } from '../types';
import { trackerEngine } from './trackerEngine';

export const TrackerGrid: React.FC = () => {
  const [pattern, setPattern] = useState<TrackerPattern>(trackerEngine.getPattern());
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(trackerEngine.getBpm());

  useEffect(() => {
    trackerEngine.setOnStepCallback((step) => {
      setCurrentStep(step);
    });
  }, []);

  const handleTogglePlay = () => {
    const playing = trackerEngine.togglePlay();
    setIsPlaying(playing);
  };

  const handleBpmChange = (newBpm: number) => {
    trackerEngine.setBpm(newBpm);
    setBpm(trackerEngine.getBpm());
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl font-mono text-zinc-200 overflow-hidden">
      {/* Tracker Transport Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
        <div className="flex items-center space-x-3">
          <div>
            <span className="text-xs text-zinc-500 uppercase tracking-wider">M8 Sequencer</span>
            <h2 className="text-sm font-bold text-amber-400">Pattern 00 / 64 Steps</h2>
          </div>
        </div>

        {/* Transport & Tempo Controls */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-zinc-950 px-3 py-1 rounded border border-zinc-800 text-xs">
            <span className="text-zinc-500">BPM:</span>
            <input
              type="number"
              min={40}
              max={300}
              value={bpm}
              onChange={(e) => handleBpmChange(parseInt(e.target.value) || 125)}
              className="w-12 bg-zinc-900 text-amber-400 font-bold text-center rounded border border-zinc-700 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleTogglePlay}
            className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${
              isPlaying
                ? 'bg-rose-500 hover:bg-rose-600 text-zinc-950 animate-pulse'
                : 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950'
            }`}
          >
            {isPlaying ? 'STOP (SPACE)' : 'PLAY (SPACE)'}
          </button>
        </div>
      </div>

      {/* Tracker Grid Matrix */}
      <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-y-auto font-mono text-xs select-none">
        <div className="grid grid-cols-6 text-center py-2 bg-zinc-900/90 text-zinc-400 border-b border-zinc-800 sticky top-0 z-10">
          <div>ROW</div>
          <div>NOTE</div>
          <div>INST</div>
          <div>VOL</div>
          <div>CMD</div>
          <div>VAL</div>
        </div>

        <div className="divide-y divide-zinc-900">
          {pattern.steps.map((step, idx) => {
            const isCurrentRow = idx === currentStep;
            return (
              <div
                key={idx}
                className={`grid grid-cols-6 text-center py-1.5 transition-colors ${
                  isCurrentRow
                    ? 'bg-amber-500/20 text-amber-300 font-bold border-y border-amber-500/40'
                    : idx % 4 === 0
                    ? 'bg-zinc-900/40 text-zinc-300'
                    : 'text-zinc-500 hover:bg-zinc-900/20'
                }`}
              >
                <div className="text-zinc-600 font-mono">
                  {idx.toString().padStart(2, '0')}
                </div>
                <div className={step.note !== '---' ? 'text-cyan-400 font-bold' : ''}>
                  {step.note}
                </div>
                <div>{step.instrument.toString(16).toUpperCase()}</div>
                <div>{step.volume.toString(16).toUpperCase()}</div>
                <div>{step.command}</div>
                <div>{step.value.toString(16).toUpperCase()}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
