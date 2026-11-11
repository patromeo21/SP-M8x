/**
 * SP-M8x Hybrid Music Production Suite
 * App.tsx — Root Application Entry Point
 */

import React, { useState } from 'react';
import { SPM8xDashboard } from './components/SPM8xDashboard';
import { audioEngine } from './audio/audioEngine';

export function App() {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isAudioInitialized, setIsAudioInitialized] = useState<boolean>(false);

  const handleStartAudio = async () => {
    if (isAudioInitialized) return;
    try {
      const analyserNode = await audioEngine.initialize();
      setAnalyser(analyserNode);
      setIsAudioInitialized(true);
    } catch (err) {
      console.error('[SP-M8x App] Failed to initialize Web Audio context:', err);
    }
  };

  return (
    <div 
      className="min-h-screen bg-zinc-950 text-zinc-100 font-mono select-none"
      onClick={handleStartAudio}
      onTouchStart={handleStartAudio}
    >
      {!isAudioInitialized && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md p-6 text-center">
          <div className="max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center mx-auto text-cyan-400 font-bold text-xl">
              ⚡
            </div>
            <h2 className="text-base font-extrabold tracking-wider text-zinc-100">
              SP-M8x HYBRID WORKSTATION
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Optimized for mobile & iPad 9th Gen hardware constraints. Tap anywhere to initialize high-performance Web Audio engine.
            </p>
            <button
              onClick={handleStartAudio}
              className="mt-2 py-3 bg-cyan-500 text-zinc-950 font-extrabold text-xs tracking-wider rounded-xl shadow-lg shadow-cyan-500/30 hover:bg-cyan-400 active:scale-95 transition-all"
            >
              INITIALIZE AUDIO ENGINE
            </button>
          </div>
        </div>
      )}

      {/* Main Dashboard Container */}
      <SPM8xDashboard analyser={analyser} />
    </div>
  );
}

export default App;