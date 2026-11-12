/**
 * SP-M8x Hybrid Music Production Suite
 * SPM8xDashboard.tsx — Main Hardware Layout Shell (iPad Optimized)
 */

import React, { useState } from 'react';
import { TrackerGrid } from '../tracker/TrackerGrid';

export type WorkspaceTab = 'workspace' | 'song' | 'phrase/table' | 'sampler';

export interface SPM8xDashboardProps {
  initialTab?: WorkspaceTab;
  activeStep?: number;
}

export const SPM8xDashboard: React.FC<SPM8xDashboardProps> = ({
  initialTab = 'workspace',
  activeStep = 0,
}) => {
  const [currentTab, setCurrentTab] = useState<WorkspaceTab>(initialTab);
  const [deckMode, setDeckMode] = useState<'pads' | 'm8'>('pads');
  const [activeBank, setActiveBank] = useState<'A' | 'B' | 'C' | 'D'>('A');

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-shell-deep)] text-[var(--text-primary)] font-mono overflow-hidden select-none">
      
      {/* 1. Persistent Top Navigation Bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-[var(--bg-canvas)] border-b border-[var(--border-grid)] shrink-0">
        <div className="flex items-center space-x-3">
          <h1 className="text-xs font-black tracking-widest text-[var(--accent-phrase)] drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
            SP-M8x <span className="text-zinc-500 font-normal">v0.9.2</span>
          </h1>
          <span className="text-[10px] bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded border border-zinc-800">
            IPAD 9TH GEN TARGET
          </span>
        </div>

        {/* Workspace Tab Switcher */}
        <nav className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-[var(--border-grid)]">
          {(['workspace', 'song', 'phrase/table', 'sampler'] as WorkspaceTab[]).map((tab) => {
            const isActive = currentTab === tab;
            let activeColorClass = 'text-[var(--accent-phrase)] border-[var(--accent-phrase)] bg-cyan-950/40';
            if (tab === 'phrase/table') activeColorClass = 'text-[var(--accent-table)] border-[var(--accent-table)] bg-purple-950/40';
            if (tab === 'song') activeColorClass = 'text-[var(--accent-song)] border-[var(--accent-song)] bg-green-950/40';

            return (
              <button
                key={tab}
                onClick={() => setCurrentTab(tab)}
                className={`px-3 py-1 text-[10px] font-bold tracking-wider rounded transition-all uppercase border ${
                  isActive
                    ? `${activeColorClass} shadow-[0_0_10px_rgba(0,0,0,0.5)]`
                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                [ {tab} ]
              </button>
            );
          })}
        </nav>
      </header>

      {/* 2. Main Viewport Container */}
      <main className="flex-1 flex overflow-hidden p-3 gap-3 bg-[var(--bg-shell-deep)]">
        {currentTab === 'workspace' ? (
          /* 60 / 40 Split Workspace Frame */
          <>
            {/* Left Pane: Tracker Matrix (60%) */}
            <section className="w-[60%] flex flex-col bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 overflow-hidden shadow-xl">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border-grid)]">
                <span className="text-[10px] font-bold text-zinc-400 tracking-wider">
                  TRACKER SEQUENCER (64 STEPS)
                </span>
                <span className="text-[10px] text-[var(--accent-phrase)] font-bold">
                  STEP: {String(activeStep).padStart(2, '0')} / 63
                </span>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <TrackerGrid patternId={0} activeStep={activeStep} />
              </div>
            </section>

            {/* Right Pane: Module Vertical Stack (40%) */}
            <section className="w-[40%] flex flex-col gap-3 overflow-y-auto">
              {/* Sampler Workbench Scaffold */}
              <div className="bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col min-h-[160px]">
                <div className="flex items-center justify-between border-b border-[var(--border-grid)] pb-2 mb-2">
                  <span className="text-[10px] font-bold text-purple-400 tracking-wider">
                    SAMPLER WORKBENCH
                  </span>
                  <span className="text-[9px] bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded cursor-pointer hover:bg-zinc-800">
                    SLICER
                  </span>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded bg-zinc-950/50 text-zinc-500 text-[11px] p-4">
                  <div className="text-zinc-400 font-bold mb-1">NO SAMPLE LOADED</div>
                  <div className="w-full h-8 bg-zinc-900/80 rounded flex items-center justify-center border border-zinc-800 text-[9px] text-zinc-600 tracking-widest">
                    Waveform View / Slicing Grid
                  </div>
                </div>
              </div>

              {/* Sampler Pads / M8 Deck Matrix Container */}
              <div className="bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col flex-1">
                <div className="flex items-center justify-between border-b border-[var(--border-grid)] pb-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold text-[var(--accent-phrase)] tracking-wider">
                      PAD BANKS & M8 DECKS
                    </span>
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setDeckMode('pads')}
                      className={`text-[9px] px-2 py-0.5 rounded font-bold transition-all ${
                        deckMode === 'pads' ? 'bg-cyan-950 text-[var(--accent-phrase)] border border-cyan-800' : 'bg-zinc-900 text-zinc-500'
                      }`}
                    >
                      PADS
                    </button>
                    <button
                      onClick={() => setDeckMode('m8')}
                      className={`text-[9px] px-2 py-0.5 rounded font-bold transition-all ${
                        deckMode === 'm8' ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-zinc-900 text-zinc-500'
                      }`}
                    >
                      M8 DECK
                    </button>
                  </div>
                </div>

                {deckMode === 'pads' ? (
                  <div className="flex flex-col flex-1 gap-2">
                    <div className="flex justify-between items-center bg-zinc-950 px-2 py-1 rounded text-[9px]">
                      <span className="text-zinc-400">BANK: <strong className="text-cyan-400">{activeBank}</strong></span>
                      <div className="flex space-x-1">
                        {(['A', 'B', 'C', 'D'] as const).map((b) => (
                          <button
                            key={b}
                            onClick={() => setActiveBank(b)}
                            className={`px-2 py-0.5 rounded ${activeBank === b ? 'bg-cyan-900 text-cyan-200' : 'bg-zinc-900 text-zinc-400'}`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 flex-1">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div key={i} className="bg-zinc-950 border border-zinc-800 rounded p-1.5 flex flex-col justify-between text-[9px] hover:border-cyan-500/50 transition-all cursor-pointer">
                          <span className="text-zinc-500 font-bold">{activeBank}{String(i + 1).padStart(2, '0')}</span>
                          <span className="text-zinc-600 text-[8px] truncate">EMPTY</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 flex-1 items-center p-2 bg-zinc-950/40 rounded border border-zinc-800/60">
                    {['UP', 'DOWN', 'LEFT', 'RIGHT', 'EDIT', 'PLAY', 'SHIFT', 'BND'].map((btn) => (
                      <button key={btn} className="bg-zinc-900 border border-zinc-700 rounded py-3 text-[10px] font-bold text-zinc-300 hover:bg-cyan-950 hover:text-cyan-300 transition-all">
                        {btn}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          /* Visual Scaffolds for Unselected Tabs matching video */
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl">
            <div className="text-center">
              <h2 className="text-sm font-bold text-[var(--accent-phrase)] uppercase tracking-widest mb-1">
                -- {currentTab} VIEW --
              </h2>
              <p className="text-[11px] text-zinc-500">
                {currentTab === 'song' && '6-track arrangement view is planned. current grid in wired yet.'}
                {currentTab === 'phrase/table' && 'Unified tracker columns are planned. current project does not expose all requested fields.'}
                {currentTab === 'sampler' && 'Advanced sample workbench and slice editor.'}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* 3. Footer Transport / Status Bar */}
      <footer className="flex items-center justify-between px-4 py-2 bg-[var(--bg-canvas)] border-t border-[var(--border-grid)] text-[10px] text-zinc-400 shrink-0">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-zinc-300 font-bold">ENGINE READY</span>
          </span>
          <span>BPM: <strong className="text-zinc-200">120.0</strong></span>
          <span>CLOCK: <strong className="text-zinc-200">INTERNAL</strong></span>
        </div>
        <div className="text-[9px] text-zinc-600">
          SP-M8x HARDWARE INTERFACE SHELL
        </div>
      </footer>
    </div>
  );
};

export default SPM8xDashboard;