import React, { useEffect, useState } from 'react';
import { SamplerWorkbench } from '../sampler/SamplerWorkbench';
import { HardwareDeck } from './HardwareDeck';
import { TrackerGrid } from '../tracker/TrackerGrid';
import { trackerEngine, type TrackerEngineState } from '../tracker/trackerEngine';

export type WorkspaceTab = 'workspace' | 'song' | 'table' | 'sampler';

export interface SPM8xDashboardProps {
  initialTab?: WorkspaceTab;
  activeStep?: number;
}

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'workspace', label: 'WORKSPACE' },
  { id: 'song', label: 'SONG' },
  { id: 'table', label: 'PHRASE/TABLE' },
  { id: 'sampler', label: 'SAMPLER' },
];

const PlaceholderView: React.FC<{ title: string; detail: string }> = ({ title, detail }) => (
  <section className="flex min-h-0 flex-1 items-center justify-center border border-[var(--border-grid)] bg-[var(--bg-canvas)]">
    <div className="text-center">
      <h2 className="mb-2 text-sm font-bold tracking-widest text-[var(--accent-phrase)]">{title}</h2>
      <p className="text-[10px] text-zinc-500">{detail}</p>
      <p className="mt-1 text-[9px] text-zinc-600">VISUAL MODULE PLACEHOLDER — NO PROJECT DATA EDITED</p>
    </div>
  </section>
);

const WorkbenchPanel: React.FC = () => (
  <section className="flex min-h-0 flex-col border border-[var(--border-grid)] bg-[var(--bg-canvas)]">
    <div className="shrink-0 border-b border-[var(--border-grid)] px-3 py-2 text-[10px] font-bold tracking-wider text-[var(--accent-table)]">
      SAMPLER WORKBENCH
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      <SamplerWorkbench />
    </div>
  </section>
);

export const SPM8xDashboard: React.FC<SPM8xDashboardProps> = ({
  initialTab = 'workspace',
  activeStep = 0,
}) => {
  const [currentTab, setCurrentTab] = useState<WorkspaceTab>(initialTab);
  const [playheadState, setPlayheadState] = useState<TrackerEngineState>(() => trackerEngine.getState());

  useEffect(() => {
    const unsubscribe = trackerEngine.subscribe(setPlayheadState);
    return unsubscribe;
  }, []);

  const visibleStep = activeStep;
  const handleTransportToggle = () => {
    if (playheadState.isPlaying) trackerEngine.stop();
    else trackerEngine.start();
  };

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--bg-shell-deep)] font-mono text-[var(--text-primary)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border-grid)] bg-[var(--bg-canvas)] px-3 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-black tracking-widest text-[var(--accent-phrase)]">SP-M8x <span className="font-normal text-zinc-500">v0.9.2</span></h1>
          <span className="border border-zinc-800 bg-zinc-900 px-2 py-1 text-[9px] text-zinc-400">IPAD 9TH GEN TARGET</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTransportToggle}
            className="min-h-8 rounded border border-cyan-500 bg-cyan-500/10 px-3 text-[9px] font-bold tracking-widest text-cyan-300 transition hover:bg-cyan-500/20"
          >
            {playheadState.isPlaying ? 'STOP' : 'PLAY'}
          </button>
        </div>
        <nav className="flex max-w-full items-center gap-1 overflow-x-auto bg-zinc-950 p-1" aria-label="Main views">
          {tabs.map(({ id, label }) => {
            const color = id === 'song' ? 'var(--accent-song)' : id === 'table' ? 'var(--accent-table)' : 'var(--accent-phrase)';
            const selected = currentTab === id;
            return (
              <button key={id} type="button" aria-current={selected ? 'page' : undefined}
                onClick={() => setCurrentTab(id)}
                className="min-h-10 shrink-0 border px-3 text-[9px] font-bold tracking-wider"
                style={{ color: selected ? color : '#71717a', borderColor: selected ? color : 'transparent' }}>
                [ {label} ]
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden p-2">
        {currentTab === 'workspace' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 landscape:grid-cols-[3fr_2fr]">
            <section className="flex min-h-0 flex-col overflow-hidden border border-[var(--border-grid)] bg-[var(--bg-canvas)] p-2">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-grid)] px-2 py-2 text-[10px] font-bold">
                <span className="text-zinc-400">TRACKER SEQUENCER (64 STEPS)</span>
                <span className="text-[var(--accent-phrase)]">STEP: {String(visibleStep).padStart(2, '0')} / 63</span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <TrackerGrid patternId={0} activeStep={visibleStep} />
              </div>
            </section>
            <section className="grid min-h-0 grid-rows-[minmax(160px,35%)_minmax(0,1fr)] gap-2 overflow-hidden">
              <WorkbenchPanel />
              <HardwareDeck />
            </section>
          </div>
        )}

        {currentTab === 'sampler' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 landscape:grid-cols-2">
            <WorkbenchPanel />
            <HardwareDeck />
          </div>
        )}

        {currentTab === 'song' && <PlaceholderView title="SONG VIEW" detail="8-track arrangement view is planned; no song grid is wired yet." />}
        {currentTab === 'table' && <PlaceholderView title="PHRASE / TABLE" detail="Unified tracker columns are planned; current project state does not expose all requested fields." />}
      </main>

      <footer className="flex shrink-0 items-center justify-between border-t border-[var(--border-grid)] bg-[var(--bg-canvas)] px-3 py-2 text-[9px] text-zinc-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-emerald-400" /><strong className="text-zinc-300">ENGINE READY</strong></span>
          <span>BPM: <strong className="text-zinc-200">120.0</strong></span>
          <span>CLOCK: <strong className="text-zinc-200">{playheadState.isPlaying ? 'RUNNING' : 'INTERNAL'}</strong></span>
        </div>
        <span className="text-zinc-600">SP-M8x HARDWARE INTERFACE</span>
      </footer>
    </div>
  );
};

export default SPM8xDashboard;
