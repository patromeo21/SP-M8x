import React, { useEffect, useRef, useState } from 'react';
import { SamplerWorkbench } from '../sampler/SamplerWorkbench';
import { HardwareDeck } from './HardwareDeck';
import { TrackerGrid } from '../tracker/TrackerGrid';
import { trackerEngine, type TrackerEngineState } from '../tracker/trackerEngine';

export type WorkspaceTab = 'workspace' | 'song' | 'table' | 'mixer' | 'sampler';

export interface SPM8xDashboardProps {
  initialTab?: WorkspaceTab;
  activeStep?: number;
}

const tabs: Array<{ id: Exclude<WorkspaceTab, 'sampler'>; label: string }> = [
  { id: 'workspace', label: 'PHRASE/SAMPLER' },
  { id: 'song', label: 'SONG' },
  { id: 'table', label: 'PHRASE/TABLE' },
  { id: 'mixer', label: 'MIXER' },
];

const PlaceholderView: React.FC<{ title: string; detail: string }> = ({ title, detail }) => (
  <section className="flex min-h-0 flex-1 items-center justify-center border border-[var(--border-grid)] bg-[var(--bg-canvas)]">
    <div className="max-w-lg px-4 text-center">
      <h2 className="mb-2 text-sm font-bold tracking-widest text-[var(--accent-phrase)]">{title}</h2>
      <p className="text-[10px] text-zinc-500">{detail}</p>
      <p className="mt-2 text-[9px] text-zinc-600">VIEW SHELL READY · PROJECT MODEL / AUDIO ROUTING NOT YET CONNECTED</p>
    </div>
  </section>
);

const WorkbenchPanel: React.FC = () => (
  <section className="flex min-h-0 flex-col border border-[var(--border-grid)] bg-[var(--bg-canvas)]">
    <div className="shrink-0 border-b border-[var(--border-grid)] px-3 py-2 text-[10px] font-bold tracking-wider text-[var(--accent-table)]">SAMPLER WORKBENCH / CHOPPER</div>
    <div className="min-h-0 flex-1 overflow-auto"><SamplerWorkbench /></div>
  </section>
);

export const SPM8xDashboard: React.FC<SPM8xDashboardProps> = ({ initialTab = 'workspace', activeStep = 0 }) => {
  const normalizedInitialTab = initialTab === 'sampler' ? 'workspace' : initialTab;
  const [currentTab, setCurrentTab] = useState<Exclude<WorkspaceTab, 'sampler'>>(normalizedInitialTab);
  const [transport, setTransport] = useState<TrackerEngineState>(() => trackerEngine.getState());
  const stepReadoutRef = useRef<HTMLSpanElement>(null);

  useEffect(() => trackerEngine.subscribe(setTransport), []);

  // Read the audio-clock playhead directly into the DOM; no React render per step/frame.
  useEffect(() => {
    let frameId = 0;
    let mounted = true;
    const updateReadout = () => {
      if (!mounted) return;
      const step = trackerEngine.getPlayheadPosition().stepIndex;
      if (stepReadoutRef.current) stepReadoutRef.current.textContent = String(step).padStart(2, '0');
      frameId = window.requestAnimationFrame(updateReadout);
    };
    frameId = window.requestAnimationFrame(updateReadout);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const handleTransportToggle = () => {
    if (transport.isPlaying) trackerEngine.stop();
    else trackerEngine.start();
  };

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--bg-shell-deep)] font-mono text-[var(--text-primary)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border-grid)] bg-[var(--bg-canvas)] px-3 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-black tracking-widest text-[var(--accent-phrase)]">SP-M8x <span className="font-normal text-zinc-500">v0.9.2</span></h1>
          <span className="hidden border border-zinc-800 bg-zinc-900 px-2 py-1 text-[9px] text-zinc-400 sm:inline">IPAD 9TH GEN TARGET</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-500">{transport.bpm.toFixed(1)} BPM</span>
          <button type="button" onClick={handleTransportToggle} aria-label={transport.isPlaying ? 'Stop playback' : 'Start playback'}
            className="min-h-10 rounded border border-cyan-500 bg-cyan-500/10 px-4 text-[10px] font-bold tracking-widest text-cyan-300 transition hover:bg-cyan-500/20">
            {transport.isPlaying ? 'STOP' : 'PLAY'}
          </button>
        </div>
        <nav className="flex max-w-full items-center gap-1 overflow-x-auto bg-zinc-950 p-1" aria-label="Main views">
          {tabs.map(({ id, label }) => {
            const color = id === 'song' ? 'var(--accent-song)' : id === 'table' ? 'var(--accent-table)' : id === 'mixer' ? 'var(--accent-table)' : 'var(--accent-phrase)';
            const selected = currentTab === id;
            return <button key={id} type="button" aria-current={selected ? 'page' : undefined} onClick={() => setCurrentTab(id)}
              className="min-h-10 shrink-0 border px-3 text-[9px] font-bold tracking-wider"
              style={{ color: selected ? color : '#71717a', borderColor: selected ? color : 'transparent' }}>[ {label} ]</button>;
          })}
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden p-2">
        {currentTab === 'workspace' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 landscape:grid-cols-[3fr_2fr]">
            <section className="flex min-h-0 flex-col overflow-hidden border border-[var(--border-grid)] bg-[var(--bg-canvas)] p-2">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-grid)] px-2 py-2 text-[10px] font-bold">
                <span className="text-zinc-400">PHRASE · STEP <span ref={stepReadoutRef}>{String(activeStep).padStart(2, '0')}</span> / 63</span>
                <span className="text-[var(--accent-phrase)]">64-STEP PHRASE</span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto"><TrackerGrid patternId={0} activeStep={activeStep} /></div>
            </section>
            <section className="grid min-h-0 grid-rows-[minmax(160px,35%)_minmax(0,1fr)] gap-2 overflow-hidden">
              <WorkbenchPanel />
              <HardwareDeck />
            </section>
          </div>
        )}
        {currentTab === 'song' && <PlaceholderView title="SONG ARRANGEMENT" detail="The 8-track × 32-row arrangement view is staged next; arrangement cells need a persisted song model before they can safely edit project data." />}
        {currentTab === 'table' && <PlaceholderView title="PHRASE / TABLE EDITOR" detail="Full-screen phrase parameters, macro curves, and automation lanes are staged after the tracker data model and scheduler event pipeline are unified." />}
        {currentTab === 'mixer' && <PlaceholderView title="MIXER / MASTER BUS" detail="Eight track strips, master controls, and Punch-In FX routing require track-channel audio routing; this view remains a safe shell until that graph exists." />}
      </main>

      <footer className="flex shrink-0 items-center justify-between border-t border-[var(--border-grid)] bg-[var(--bg-canvas)] px-3 py-2 text-[9px] text-zinc-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className={`h-2 w-2 ${transport.isPlaying ? 'bg-emerald-400' : 'bg-zinc-600'}`} /><strong className="text-zinc-300">{transport.isPlaying ? 'ENGINE RUNNING' : 'ENGINE READY'}</strong></span>
          <span>BPM: <strong className="text-zinc-200">{transport.bpm.toFixed(1)}</strong></span>
          <span>CLOCK: <strong className="text-zinc-200">{transport.isPlaying ? 'AUDIO' : 'INTERNAL'}</strong></span>
        </div>
        <span className="text-zinc-600">SP-M8x PERFORMANCE WORKSTATION</span>
      </footer>
    </div>
  );
};

export default SPM8xDashboard;
