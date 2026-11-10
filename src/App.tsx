/**
 * SP-M8x Hybrid Music Production Suite
 * App.tsx — Master Shell Container & View Controller
 */

import React, { useState } from 'react';
import { Pad, SamplerMode, BankId } from './types';
import { SamplerWorkspace } from './sampler/SamplerWorkspace';

// Initialize 16 pads for Bank A
const createInitialPads = (): Pad[] => {
  return Array.from({ length: 16 }, (_, i) => ({
    id: i,
    name: `Sample ${i + 1}`,
    buffer: null,
    sliceStart: 0,
    sliceEnd: 1,
    volume: 0.8,
    pan: 0,
    pitchOffset: 0,
    reverse: false,
    loop: false,
    chromaticRootNote: 60, // C4
  }));
};

export const App: React.FC = () => {
  const [pads, setPads] = useState<Pad[]>(createInitialPads());
  const [activeBank, setActiveBank] = useState<BankId>('A');
  const [samplerMode, setSamplerMode] = useState<SamplerMode>('SAMPLE_TRIGGER');
  const [activeTab, setActiveTab] = useState<'sampler' | 'fx' | 'tracker'>('sampler');

  const handleUpdatePad = (updatedPad: Pad) => {
    setPads((prevPads) =>
      prevPads.map((p) => (p.id === updatedPad.id ? updatedPad : p))
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-mono overflow-hidden select-none">
      {/* Top Navigation & Header Bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center space-x-3">
          <h1 className="text-sm font-black tracking-widest text-amber-400">
            SP-M8x <span className="text-[10px] text-zinc-500 font-normal">v1.0.0</span>
          </h1>
          <div className="hidden sm:flex items-center space-x-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-800 text-xs">
            <span className="text-zinc-500">Target:</span>
            <span className="text-cyan-400">iPad 9th Gen (A13)</span>
          </div>
        </div>

        {/* Workspace Mode Tabs */}
        <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('sampler')}
            className={`px-3 py-1 text-xs rounded transition-all ${
              activeTab === 'sampler'
                ? 'bg-amber-500 text-zinc-950 font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Sampler
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fx')}
            className={`px-3 py-1 text-xs rounded transition-all ${
              activeTab === 'fx'
                ? 'bg-amber-500 text-zinc-950 font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            FX Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tracker')}
            className={`px-3 py-1 text-xs rounded transition-all ${
              activeTab === 'tracker'
                ? 'bg-amber-500 text-zinc-950 font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            M8 Tracker
          </button>
        </div>

        {/* Global Controls & Mode Switchers */}
        <div className="flex items-center space-x-2">
          {/* Bank Selector */}
          <div className="flex bg-zinc-950 rounded border border-zinc-800 overflow-hidden text-xs">
            {(['A', 'B', 'C', 'D'] as BankId[]).map((bank) => (
              <button
                key={bank}
                type="button"
                onClick={() => setActiveBank(bank)}
                className={`px-2 py-1 transition-all ${
                  activeBank === bank
                    ? 'bg-zinc-800 text-amber-400 font-bold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {bank}
              </button>
            ))}
          </div>

          {/* Sampler Mode Toggle */}
          <button
            type="button"
            onClick={() =>
              setSamplerMode((m) =>
                m === 'SAMPLE_TRIGGER' ? 'MPC_CHROMATIC' : 'SAMPLE_TRIGGER'
              )
            }
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 text-xs rounded border border-zinc-700 transition-all"
          >
            {samplerMode === 'SAMPLE_TRIGGER' ? 'Trigger Mode' : 'MPC Chromatic'}
          </button>
        </div>
      </header>

      {/* Main Viewport Workspace Container */}
      <main className="flex-1 overflow-hidden bg-zinc-950">
        {activeTab === 'sampler' && (
          <SamplerWorkspace
            pads={pads}
            mode={samplerMode}
            activeBank={activeBank}
            onUpdatePad={handleUpdatePad}
          />
        )}
        {activeTab === 'fx' && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            FX Matrix Workspace (Coming Soon in Phase 3)
          </div>
        )}
        {activeTab === 'tracker' && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            M8 Tracker Workspace (Coming Soon in Phase 4)
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
