/**
 * SP-M8x Hybrid Music Production Suite
 * SPM8xDashboard.tsx — Main Application Dashboard View
 */

import React, { useEffect, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { trackerEngine } from '../tracker/trackerEngine';
import { projectController, ProjectState } from '../project/projectController';
import { PadBankManager } from '../sampler/PadBankManager';
// Assuming TrackerGrid is imported from your tracker module:
// import { TrackerGrid } from '../tracker/TrackerGrid';

export const SPM8xDashboard: React.FC = () => {
  const [projectState, setProjectState] = useState<ProjectState>(() => projectController.getState());
  const [isAudioInitialized, setIsAudioInitialized] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = projectController.subscribe((newState) => {
      setProjectState({ ...newState });
    });

    trackerEngine.setStepCallback((step) => {
      setActiveStep(step);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleInitAudio = async () => {
    try {
      await audioEngine.initialize();
      setIsAudioInitialized(true);
      console.log('[SPM8xDashboard] AudioContext successfully initialized & resumed.');
    } catch (err) {
      console.error('[SPM8xDashboard] Failed to initialize AudioContext:', err);
    }
  };

  const handleTogglePlay = () => {
    const playing = trackerEngine.togglePlay();
    setIsPlaying(playing);
  };

  const activePatternIndex = projectState.settings.activePatternIndex;
  const currentPattern = projectState.tracker.patterns[activePatternIndex] || projectState.tracker.patterns[0];

  return (
    <div className="flex flex-col w-screen h-screen bg-zinc-950 text-zinc-100 font-mono select-none overflow-hidden p-4 gap-4">
      {/* Header & Audio Gate */}
      <header className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h1 className="text-sm font-bold tracking-widest text-cyan-400">SP-M8x</h1>
          <p className="text-[10px] text-zinc-500">Hybrid Sampler & Tracker Suite (iPad 9th Gen Target)</p>
        </div>

        {!isAudioInitialized ? (
          <button
            type="button"
            onPointerDown={handleInitAudio}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold text-xs rounded-lg transition-all active:scale-95 shadow-lg shadow-cyan-900/30"
          >
            INITIALIZE AUDIO GATE
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-bold">AUDIO READY</span>
          </div>
        )}
      </header>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-y-auto">
        {/* Left Column: Sampler Pads (Banks A-D) */}
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-bold text-zinc-400">SAMPLER PAD BANKS (A - D)</h2>
          <PadBankManager />
        </div>

        {/* Right Column: Transport, Sequencer & Master FX */}
        <div className="flex flex-col gap-4">
          {/* Transport Controls */}
          <div className="flex flex-col gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <h2 className="text-xs font-bold text-zinc-400">TRANSPORT CONTROLS</h2>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onPointerDown={handleTogglePlay}
                disabled={!isAudioInitialized}
                className={`px-6 py-3 rounded-xl font-bold text-xs transition-all active:scale-95 ${
                  isPlaying
                    ? 'bg-amber-600 hover:bg-amber-500 text-zinc-950'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                } ${!isAudioInitialized ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isPlaying ? 'STOP TRACKER' : 'PLAY TRACKER'}
              </button>
              <div className="flex flex-col items-end text-xs">
                <span className="text-zinc-500 text-[10px]">PATTERN: {currentPattern.name}</span>
                <span>
                  STEP: <span className="text-cyan-400 font-bold">{activeStep} / 63</span>
                </span>
              </div>
            </div>
          </div>

          {/* Tracker Grid Component Integration with String-Cast Pattern ID */}
          <div className="flex flex-col gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl flex-1">
            <h2 className="text-xs font-bold text-zinc-400">TRACKER STEP MATRIX</h2>
            {/* 
              Pass activePatternIndex as a string to satisfy TrackerGridProps.patternId:
              <TrackerGrid patternId={String(activePatternIndex)} /> 
            */}
            <div className="text-[10px] text-zinc-500">
              Active Pattern ID: <span className="text-cyan-400 font-bold">{String(activePatternIndex)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SPM8xDashboard;