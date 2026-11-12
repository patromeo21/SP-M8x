/**
 * SP-M8x Hybrid Music Production Suite
 * SPM8xDashboard.tsx — Main Hardware Layout Shell (iPad Optimized)
 */

import React, { useState } from 'react';
import { TrackerGrid } from '../tracker/TrackerGrid';
// Note: Additional module imports (PadGrid, SamplerWorkbench, FxStrip) 
// can be wired here as their respective Big Font styling passes are completed.

export type WorkspaceTab = 'workspace' | 'song' | 'table' | 'sampler';

export interface SPM8xDashboardProps {
  initialTab?: WorkspaceTab;
  activeStep?: number;
}

export const SPM8xDashboard: React.FC<SPM8xDashboardProps> = ({
  initialTab = 'workspace',
  activeStep = 0,
}) => {
  const [currentTab, setCurrentTab] = useState<WorkspaceTab>(initialTab);

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
          {(['workspace', 'song', 'table', 'sampler'] as WorkspaceTab[]).map((tab) => {
            const isActive = currentTab === tab;
            let activeColorClass = 'text-[var(--accent-phrase)] border-[var(--accent-phrase)] bg-cyan-950/40';
            if (tab === 'table') activeColorClass = 'text-[var(--accent-table)] border-[var(--accent-table)] bg-purple-950/40';
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
                  <span className="text-[9px] bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded">
                    SLICER
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center border border-dashed border-zinc-800 rounded bg-zinc-950/50 text-zinc-600 text-[11px]">
                  Waveform View / Slicing Grid
                </div>
              </div>

              {/* Sampler Pads / M8 Deck Matrix Container */}
              <div className="bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col flex-1">
                <div className="flex items-center justify-between border-b border-[var(--border-grid)] pb-2 mb-2">
                  <span className="text-[10px] font-bold text-[var(--accent-phrase)] tracking-wider">
                    PAD BANKS & M8 DECKS
                  </span>
                  <span className="text-[9px] bg-cyan-950 text-[var(--accent-phrase)] px-1.5 py-0.5 rounded font-bold">
                    BANK A-D
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center border border-dashed border-zinc-800 rounded bg-zinc-950/50 text-zinc-600 text-[11px]">
                  5×3 Pad / Deck Grid Container
                </div>
              </div>
            </section>
          </>
        ) : (
          /* Visual Scaffolds for Unselected Tabs */
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl">
            <div className="text-center">
              <h2 className="text-sm font-bold text-[var(--accent-phrase)] uppercase tracking-widest mb-1">
                -- {currentTab} VIEW --
              </h2>
              <p className="text-[11px] text-zinc-500">
                Module scaffold loaded. Core architecture remains active.
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