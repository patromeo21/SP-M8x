/**
 * SP-M8x Hybrid Music Production Suite
 * SPM8xDashboard.tsx — Master Mobile-Optimized Dashboard View
 */

import React, { useState } from 'react';
import { TrackerGrid } from '../tracker/TrackerGrid';
import { PadBankManager } from '../sampler/PadBankManager';
import { MasterMixerAndPunchInFX } from '../fx/MasterMixerAndPunchInFX';
import { useAudioVisualizer } from '../services/audio/useAudioVisualizer';
import { projectController } from '../project/projectController';

interface SPM8xDashboardProps {
  analyser: AnalyserNode | null;
}

export const SPM8xDashboard: React.FC<SPM8xDashboardProps> = ({ analyser }) => {
  const [activeTab, setActiveTab] = useState<'tracker' | 'pads' | 'fx'>('tracker');
  const [visualizerMode, setVisualizerMode] = useState<'waveform' | 'frequency'>('waveform');
  const [currentStep, setCurrentStep] = useState<number>(0);

  const projectState = projectController.getState();
  const currentPattern = projectState.tracker.patterns[0];

  // Initialize high-performance 120fps canvas audio visualizer
  const { canvasRef, setMode: toggleVisualizerMode } = useAudioVisualizer({
    analyser,
    mode: visualizerMode,
    targetFps: 120, // Maximize resolution for high-refresh mobile/tablet viewports
  });

  const handleModeSwitch = (mode: 'waveform' | 'frequency') => {
    setVisualizerMode(mode);
    toggleVisualizerMode(mode);
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 font-mono select-none pb-12">
      {/* Top Header / Status Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-500/50" />
          <h1 className="text-sm font-extrabold tracking-wider text-zinc-100">
            SP-M8<span className="text-amber-500">x</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800 font-bold text-zinc-300">
            {projectState.projectName ?? 'SP-M8x Project'}
          </span>
          <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800 text-amber-400 font-bold">
            {projectState.settings.bpm} BPM
          </span>
        </div>
      </header>

      {/* Visualizer & Header Canvas */}
      <div className="p-4 bg-zinc-950 border-b border-zinc-900">
        <div className="relative flex flex-col rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-zinc-950/80 backdrop-blur px-2 py-1 rounded-lg border border-zinc-800 text-[10px]">
            <button
              onClick={() => handleModeSwitch('waveform')}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                visualizerMode === 'waveform' ? 'bg-cyan-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              WAVE
            </button>
            <button
              onClick={() => handleModeSwitch('frequency')}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                visualizerMode === 'frequency' ? 'bg-cyan-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              SPECTRUM
            </button>
          </div>

          <canvas
            ref={canvasRef}
            width={800}
            height={140}
            className="w-full h-28 object-cover bg-zinc-950"
          />
        </div>
      </div>

      {/* Navigation Tabs (Mobile View Switcher) */}
      <div className="flex items-center px-4 gap-2 py-2">
        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-all ${
            activeTab === 'tracker'
              ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-lg shadow-amber-500/20'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-900'
          }`}
        >
          TRACKER VIEW
        </button>
        <button
          onClick={() => setActiveTab('pads')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-all ${
            activeTab === 'pads'
              ? 'bg-cyan-500 text-zinc-950 border-cyan-500 shadow-lg shadow-cyan-500/20'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-900'
          }`}
        >
          PAD BANK
        </button>
        <button
          onClick={() => setActiveTab('fx')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-all ${
            activeTab === 'fx'
              ? 'bg-emerald-500 text-zinc-950 border-emerald-500 shadow-lg shadow-emerald-500/20'
              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-900'
          }`}
        >
          MIXER & FX
        </button>
      </div>

      {/* Main Viewport Content Area */}
      <main className="flex-1 px-4 py-2">
        {activeTab === 'tracker' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span>PATTERN: {currentPattern?.name ?? 'Pattern 1'}</span>
              <span>STEP: {String(currentStep + 1).padStart(2, '0')} / 64</span>
            </div>
            <TrackerGrid
              patternId={currentPattern?.id}
              currentStepIndex={currentStep}
              onStepSelect={(step) => setCurrentStep(step)}
            />
          </div>
        )}

        {activeTab === 'pads' && (
          <div className="flex flex-col gap-3">
            <PadBankManager />
          </div>
        )}

        {activeTab === 'fx' && (
          <div className="flex flex-col gap-3">
            <MasterMixerAndPunchInFX />
          </div>
        )}
      </main>
    </div>
  );
};
