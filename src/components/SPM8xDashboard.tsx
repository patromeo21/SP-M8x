import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SamplerWorkspace } from '../sampler/SamplerWorkspace';
import { usePadBank, useEngineStatus } from '../sampler/usePadBank';
import { useInputRecorder } from '../sampler/useInputRecorder';
import { audioEngine } from '../audio/audioEngine';
import { MasterOutput } from '../audio/MasterOutput';
import { trackerEngine } from '../tracker/trackerEngine';
import { trackerBridge } from '../tracker/trackerBridge';
import { projectController } from '../project/projectController';
import { PhraseTableEditor } from '../tracker/PhraseTableEditor';
import { chromaticNote } from '../sampler/chromatic';
import { instrumentIdToPadId, padIdToInstrumentId } from '../sampler/padIds';

export type WorkspaceTab = 'phrase' | 'table' | 'song' | 'mixer' | 'sampler';

export interface SPM8xDashboardProps {
  initialTab?: WorkspaceTab;
  activeStep?: number;
}

export const SPM8xDashboard: React.FC<SPM8xDashboardProps> = ({ initialTab = 'phrase', activeStep = -1 }) => {
  const [currentTab, setCurrentTab] = useState<WorkspaceTab>(initialTab);
  const padBank = usePadBank();
  const recorder = useInputRecorder(padBank.loadSample);
  const engineStatus = useEngineStatus();
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [playhead, setPlayhead] = useState(-1);
  const [transportMessage, setTransportMessage] = useState('');
  const [, refreshProject] = useState(0);
  const startGeneration = useRef(0);
  const recordingRef = useRef(false);
  recordingRef.current = armed && playing;
  const stopTransport = useCallback(() => {
    startGeneration.current++;
    trackerEngine.stop();
    padBank.stopGatedVoices();
    setStarting(false);
    setPlaying(false);
    setPlayhead(-1);
  }, [padBank.stopGatedVoices]);

  useEffect(() => {
    (projectController.getState().settings.trackVolumes ?? Array.from({ length: 8 }, () => 1))
      .forEach((volume, index) => audioEngine.setTrackVolume(index, volume));
    trackerBridge.setPadSettingsProvider(padBank.getPadSettings);
    trackerEngine.setCallbacks(setPlayhead, (reason) => {
      setPlaying(false);
      setPlayhead(-1);
      if (reason) setTransportMessage(reason);
    });
    const unsubscribe = projectController.subscribe(() => refreshProject((value) => value + 1));
    const unsubscribeOverload = audioEngine.subscribeOverload(setTransportMessage);
    return () => {
      startGeneration.current++;
      trackerEngine.stop();
      trackerBridge.setPadSettingsProvider(null);
      unsubscribe();
      unsubscribeOverload();
    };
  }, [padBank.getPadSettings]);

  const toggleTransport = useCallback(() => {
    if (playing || starting) {
      stopTransport();
      return;
    }
    const generation = ++startGeneration.current;
    setStarting(true);
    setTransportMessage('');
    void (async () => {
      try {
        await audioEngine.initialize();
        const state = projectController.getState();
        const pattern = state.tracker.patterns[state.settings.activePatternIndex];
        if (!pattern) throw new Error('Active phrase is unavailable.');
        const ids = pattern.tracks.flatMap((track) => track.steps.slice(0, pattern.length).map((step) => instrumentIdToPadId(step.instrumentId)))
          .filter((id): id is string => id !== null);
        await padBank.preparePads(ids);
        if (generation !== startGeneration.current) return;
        await trackerEngine.start(state.settings.bpm);
        if (generation !== startGeneration.current) return;
        setPlaying(true);
      } catch (error) {
        if (generation !== startGeneration.current) return;
        console.error('[SP-M8x] Could not start transport:', error);
        setTransportMessage(error instanceof Error ? error.message : 'Could not start transport.');
      } finally {
        if (generation === startGeneration.current) setStarting(false);
      }
    })();
  }, [padBank.preparePads, playing, starting, stopTransport]);

  const triggerPad = useCallback((padId: string, _onTriggered?: (time: number) => number | void, semitoneOffset = 0, pointerTime?: number, sliceIndex?: number) => {
    const context = audioEngine.getContext();
    const captureTime = context && pointerTime !== undefined && Number.isFinite(pointerTime)
      ? context.currentTime + (pointerTime - performance.now()) / 1000 : undefined;
    let captured: { patternIndex: number; track: number; instrumentId: number; generation: number } | null = null;
    const gated = padBank.getPadSettings(padId)?.playbackMode === 'gate';
    const release = padBank.triggerPad(padId, (time) => {
      if (!recordingRef.current) return;
      const position = trackerEngine.recordPosition(captureTime ?? time);
      if (!position) return;
      const state = projectController.getState();
      const instrumentId = padIdToInstrumentId(padId);
      if (instrumentId === null) return;
      const track = projectController.recordHit(state.settings.activePatternIndex, position.step,
        state.sampler.pads[padId]?.targetTrack ?? 0, {
          note: chromaticNote(semitoneOffset), instrumentId, subTickOffset: position.subTickOffset, velocity: 127,
          ...(sliceIndex === undefined ? {} : { sliceIndex }),
        });
      if (track === null) {
        setTransportMessage(`Step ${position.step + 1} full — hit not recorded.`);
        return;
      }
      setTransportMessage('');
      if (gated) captured = { patternIndex: state.settings.activePatternIndex, track, instrumentId, generation: startGeneration.current };
      return track;
    }, semitoneOffset, pointerTime, sliceIndex);
    return (releasePointerTime?: number) => {
      release(releasePointerTime);
      if (!captured || !recordingRef.current || captured.generation !== startGeneration.current) return;
      const currentContext = audioEngine.getContext();
      const time = currentContext && releasePointerTime !== undefined && Number.isFinite(releasePointerTime)
        ? currentContext.currentTime + (releasePointerTime - performance.now()) / 1000 : currentContext?.currentTime;
      if (time === undefined) return;
      const position = trackerEngine.recordPosition(time);
      if (!position) return;
      if (!projectController.recordRelease(captured.patternIndex, position.step, captured.track, captured.instrumentId, position.subTickOffset)) {
        setTransportMessage(`Step ${position.step + 1} occupied — gate release not recorded.`);
      }
    };
  }, [padBank.triggerPad, padBank.getPadSettings]);

  if (projectController.isReadOnly()) {
    return <main className="app-shell bg-black text-rose-300 p-6 font-mono" role="alert">
      PROJECT COULD NOT BE LOADED — EDITING DISABLED. EXISTING DATA WAS NOT OVERWRITTEN.
      CHECK BROWSER STORAGE AND RELOAD.
    </main>;
  }

  return (
    <div className="app-shell flex flex-col w-full bg-[var(--bg-shell-deep)] text-[var(--text-primary)] font-mono overflow-hidden select-none">
      <header className="flex items-center justify-between px-4 py-2 bg-[var(--bg-canvas)] border-b border-[var(--border-grid)] shrink-0">
        <h1 className="text-xs font-black tracking-widest text-[var(--accent-phrase)]">SP-M8x <span className="text-zinc-500 font-normal">v0.9.2</span></h1>
        <nav className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-[var(--border-grid)]">
          {(['phrase', 'table', 'song', 'mixer', 'sampler'] as const).map((tab) => <button key={tab} type="button" onClick={() => setCurrentTab(tab)}
            className={`px-3 py-1 text-[10px] font-bold tracking-wider rounded uppercase border ${currentTab === tab ? 'text-[var(--accent-phrase)] border-[var(--accent-phrase)] bg-cyan-950/40' : 'text-zinc-500 border-transparent'}`}>[ {tab} ]</button>)}
        </nav>
      </header>
      <main className="flex-1 flex overflow-hidden p-3 gap-3 bg-[var(--bg-shell-deep)]">
        {currentTab === 'phrase'
          ? <div className="phrase-workspace">
              <PhraseTableEditor slots={padBank.slots} activeStep={playing ? playhead : activeStep} transportBusy={playing || starting} mode="phrase" />
              <SamplerWorkspace padBank={padBank} recorder={recorder} triggerPad={triggerPad} compact />
            </div>
          : currentTab === 'table'
            ? <PhraseTableEditor slots={padBank.slots} activeStep={playing ? playhead : activeStep} transportBusy={playing || starting} mode="table" />
          : currentTab === 'sampler'
            ? <SamplerWorkspace padBank={padBank} recorder={recorder} triggerPad={triggerPad} />
            : <section className="flex-1 p-4 bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl">
                <h2 className="text-sm text-cyan-300 uppercase">{currentTab}</h2>
                {currentTab === 'song' ? <p className="text-xs text-zinc-400 mt-2">Song arrangement is not yet implemented.</p> :
                  <div className="flex gap-4 mt-4">
                    {(projectController.getState().settings.trackVolumes ?? Array.from({ length: 8 }, () => 1)).map((volume, index) =>
                      <label key={index} className="flex flex-col gap-2 text-xs">TRACK {index + 1}
                        <input aria-label={`Track ${index + 1} volume`} type="range" min="0" max="1" step="0.01" value={volume}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            projectController.setTrackVolume(index, value);
                            audioEngine.setTrackVolume(index, value);
                          }} />
                        <span>{Math.round(volume * 100)}%</span>
                      </label>)}
                  </div>}
              </section>}
      </main>
      <footer className="flex items-center justify-between px-4 py-2 bg-[var(--bg-canvas)] border-t border-[var(--border-grid)] text-[10px] text-zinc-400 shrink-0">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${engineStatus.state === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            {engineStatus.state === 'running' ? <span className="text-zinc-300 font-bold">ENGINE READY</span> :
              engineStatus.state === 'closed' ? <span role="alert" className="text-rose-300 font-bold">AUDIO CLOSED — RELOAD</span> :
              <button type="button" className="text-amber-300 font-bold" onClick={() => {
                setAudioError(false);
                void audioEngine.initialize().catch((error: unknown) => {
                  console.error('[SP-M8x] Could not resume audio:', error);
                  setAudioError(true);
                });
              }}>{audioError ? 'AUDIO BLOCKED — TAP TO RETRY' : engineStatus.state === 'idle' ? 'TAP TO START AUDIO' : 'AUDIO PAUSED — TAP TO RESUME'}</button>}
          </span>
          <span>VOICES: <strong className="text-zinc-200">{engineStatus.voices}</strong></span>
          <button type="button" onClick={toggleTransport} className="text-cyan-300 font-bold">{starting ? 'CANCEL' : playing ? 'STOP' : 'PLAY'}</button>
          <button type="button" onClick={stopTransport} className="text-rose-300 font-bold">STOP</button>
          <button type="button" aria-pressed={armed} onClick={() => setArmed(!armed)} className={armed ? 'text-rose-400 font-bold' : 'text-zinc-400'}>{armed ? 'PHRASE REC ARMED' : 'PHRASE REC'}</button>
          <span>BPM: <strong className="text-zinc-200">{projectController.getState().settings.bpm.toFixed(1)}</strong></span>
          <MasterOutput savedLocally={padBank.storageReady && !padBank.storageError && !projectController.hasSaveError() && !['SAVING', 'DELETING'].includes(padBank.storageStatus)} />
          {padBank.storageError && <span role="alert" className="text-rose-400">{padBank.storageStatus}</span>}
          {projectController.hasSaveError() && <span role="alert" className="text-rose-400">PHRASE SAVE FAILED</span>}
          {transportMessage && <span role="alert" className="text-rose-400">{transportMessage}</span>}
        </div>
      </footer>
    </div>
  );
};

export default SPM8xDashboard;
