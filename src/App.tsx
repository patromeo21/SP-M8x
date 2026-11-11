/**
 * SP-M8x Hybrid Music Production Suite
 * App.tsx — Main Application Entry & Initialization
 */

import React, { useEffect, useState } from 'react';
import { applyTouchOptimizations } from './styles/touchOptimizer';
import { audioEngine } from './audio/audioEngine';
import { trackerEngine } from './tracker/trackerEngine';
import { AudioSampleDropzone } from './components/AudioSampleDropzone';

export const App: React.FC = () => {
  const [isAudioInitialized, setIsAudioInitialized] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0);

  // Apply iPad mobile touch optimizations on mount
  useEffect(() => {
    applyTouchOptimizations();

    // Wire tracker step callback for visual playhead feedback
    trackerEngine.setStepCallback((step) => {
      setActiveStep(step);
    });
  }, []);

  const handleInitAudio = async () => {
    try {
      await audioEngine.initialize();
      setIsAudioInitialized(true);
      console.log('[App] AudioContext successfully initialized & resumed.');
    } catch (err) {
      console.error('[App] Failed to initialize AudioContext:', err);
    }
  };

  const handleTogglePlay = () => {
    const playing = trackerEngine.togglePlay();
    setIsPlaying(playing);
  };

  const handleSampleLoaded = (padId: string, buffer: AudioBuffer, fileName: string) => {
    console.log(`[App] Sample loaded for Pad ${padId}: ${fileName} (${buffer.duration.toFixed(2)}s)`);
    // Sample is now decoded and ready for audioEngine voice triggering
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-zinc-950 text-zinc-100 font-mono select-none overflow-hidden p-4 gap-4">
      {/* Header & Audio Gate */}
      <header className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h1 className="text-sm font-bold tracking-widest text-cyan-400">SP-M8x</h1>
          <p className="text-[10px] text-zinc-500">Hybrid Sampler & Tracker Engine (iPad 9th Gen Target)</p>
        </div>

        {!isAudioInitialized ? (
          <button
            type="button"
            onPointerDown={handleInitAudio}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold text-xs rounded-lg transition-all active:scale-95 shadow-lg shadow-cyan-940/30"
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

      {/* Main Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto">
        {/* Transport & Playback */}
        <div className="flex flex-col gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h2 className="text-xs font-bold text-zinc-400">TRANSPORT CONTROLS</h2>
          <div className="flex items-center gap-4">
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
            <div className="text-xs text-zinc-400">
              CURRENT STEP: <span className="text-cyan-400 font-bold">{activeStep} / 63</span>
            </div>
          </div>
        </div>

        {/* Sample Loading Bay */}
        <div className="flex flex-col gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h2 className="text-xs font-bold text-zinc-400">PAD SAMPLE LOADER</h2>
          <AudioSampleDropzone padId="A1" onSampleLoaded={handleSampleLoaded} />
        </div>
      </div>
    </div>
  );
};

export default App;