import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SamplerWorkspace } from '../sampler/SamplerWorkspace';
import { usePadBank, useEngineStatus } from '../sampler/usePadBank';
import { useInputRecorder } from '../sampler/useInputRecorder';
import { audioEngine } from '../audio/audioEngine';
import { MasterOutput } from '../audio/MasterOutput';
import { trackerEngine } from '../tracker/trackerEngine';
import { trackerBridge } from '../tracker/trackerBridge';
import { projectController } from '../project/projectController';
import { PhraseTableEditor, type EditorProps } from '../tracker/PhraseTableEditor';
import { SongArrangementView } from '../tracker/SongArrangementView';
import { chromaticNote } from '../sampler/chromatic';
import { instrumentIdToPadId, padIdToInstrumentId } from '../sampler/padIds';
import { exportSp8Bundle, importSp8Bundle } from '../project/sp8Bundle';
import { readStoredAudio } from '../sampler/padStorage';
import type { StoredPad } from '../sampler/padStorage';

export type WorkspaceTab = 'phrase' | 'table' | 'song' | 'mixer' | 'sampler';

export interface SPM8xDashboardProps {
  initialTab?: WorkspaceTab;
  activeStep?: number;
}

export const SPM8xDashboard: React.FC<SPM8xDashboardProps> = ({ initialTab = 'phrase', activeStep = -1 }) => {
  const [currentTab, setCurrentTab] = useState<WorkspaceTab>(initialTab);
  const [contextLock, setContextLock] = useState(false);
  const padBank = usePadBank();
  const selectedPadContext: EditorProps['linkedPad'] = padBank.selectedPad ? {
    padId: padBank.selectedPadId,
    name: padBank.selectedPad.name,
    playMode: padBank.selectedPad.playbackMode,
    sliActive: projectController.getState().sampler.pads[padBank.selectedPadId]?.sliActive,
    sliceMarkers: padBank.selectedPad.sliceMarkers,
  } : undefined;
  const [lockedPadContext, setLockedPadContext] = useState<EditorProps['linkedPad']>();
  const linkedPad = contextLock ? lockedPadContext : selectedPadContext;
  const toggleContextLock = useCallback(() => {
    if (contextLock) {
      setLockedPadContext(undefined);
      setContextLock(false);
    } else {
      setLockedPadContext(selectedPadContext);
      setContextLock(true);
    }
  }, [contextLock, selectedPadContext]);
  const recorder = useInputRecorder(padBank.loadSample);
  const engineStatus = useEngineStatus();
  const [audioError, setAudioError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [fillActive, setFillActive] = useState(false);
  const [playhead, setPlayhead] = useState(-1);
  const [transportMessage, setTransportMessage] = useState('');
  const [queuedPatternIndex, setQueuedPatternIndex] = useState<number | null>(null);
  const [projectRevision, refreshProject] = useState(0);
  const [bundleStatus, setBundleStatus] = useState('');
  const [bundleBusy, setBundleBusy] = useState(false);
  const bundleInputRef = useRef<HTMLInputElement>(null);
  const startGeneration = useRef(0);
  const queueGeneration = useRef(0);
  const recordingRef = useRef(false);
  recordingRef.current = armed && playing;
  const stopTransport = useCallback(() => {
    startGeneration.current++;
    queueGeneration.current++;
    trackerEngine.stop();
    setQueuedPatternIndex(null);
    padBank.stopGatedVoices();
    setStarting(false);
    setPlaying(false);
    setPlayhead(-1);
    setFillActive(false);
    trackerEngine.setFillActive(false);
  }, [padBank.stopGatedVoices]);

  const handleUndo = useCallback(() => {
    projectController.undo();
  }, []);

  const handleRedo = useCallback(() => {
    projectController.redo();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
      } else if (key === 'y' && !event.shiftKey) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRedo, handleUndo]);

  const exportBundle = useCallback(async () => {
    if (!padBank.storageReady || bundleBusy) return;
    setBundleBusy(true);
    setBundleStatus('');
    try {
      const pads: Array<{ pad: StoredPad; audio: Blob }> = [];
      for (const slot of Object.values(padBank.slots)) {
        if (!slot.sampleKey) continue;
        const audio = await readStoredAudio(slot.id, slot.sampleKey);
        pads.push({
          pad: {
            id: slot.id,
            sampleKey: slot.sampleKey,
            name: slot.name,
            startPct: slot.startPct,
            endPct: slot.endPct,
            pitch: slot.pitch,
            loop: slot.playbackMode === 'loop',
            playbackMode: slot.playbackMode,
            sliceMarkers: slot.sliceMarkers,
          },
          audio,
        });
      }
      const bundle = await exportSp8Bundle(JSON.stringify(projectController.getState()), pads);
      const url = URL.createObjectURL(bundle);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sp-m8x-${Date.now()}.sp8`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setBundleStatus('PROJECT EXPORTED');
    } catch (error) {
      console.error('[SP-M8x] Could not export project bundle:', error);
      setBundleStatus(error instanceof Error ? error.message : 'BUNDLE EXPORT FAILED');
    } finally {
      setBundleBusy(false);
    }
  }, [bundleBusy, padBank.slots, padBank.storageReady]);

  const importBundle = useCallback(async (file: File) => {
    setBundleBusy(true);
    setBundleStatus('');
    try {
      const imported = await importSp8Bundle(file);
      projectController.importProjectJson(JSON.parse(imported.projectJson));
      await padBank.refreshFromStorage();
      setBundleStatus(`IMPORTED ${imported.projectId}`);
    } catch (error) {
      console.error('[SP-M8x] Could not import project bundle:', error);
      setBundleStatus(error instanceof Error ? error.message : 'BUNDLE IMPORT FAILED');
    } finally {
      setBundleBusy(false);
      if (bundleInputRef.current) bundleInputRef.current.value = '';
    }
  }, [padBank.refreshFromStorage]);

  useEffect(() => {
    (projectController.getState().settings.trackVolumes ?? Array.from({ length: 8 }, () => 1))
      .forEach((volume, index) => audioEngine.setTrackVolume(index, volume));
    trackerBridge.setPadSettingsProvider(padBank.getPadSettings);
    trackerEngine.setCallbacks(setPlayhead, (reason) => {
      queueGeneration.current++;
      setQueuedPatternIndex(null);
      setPlaying(false);
      setPlayhead(-1);
      if (reason) setTransportMessage(reason);
    }, (index) => {
      projectController.setActivePattern(index);
      setQueuedPatternIndex((queued) => queued === index ? null : queued);
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

  const selectPattern = useCallback((index: number) => {
    const request = ++queueGeneration.current;
    if (starting) {
      setTransportMessage('Wait for playback to start before cueing a phrase.');
      return;
    }
    if (!playing) {
      projectController.setActivePattern(index);
      setQueuedPatternIndex(null);
      return;
    }
    const pattern = projectController.getState().tracker.patterns[index];
    if (!pattern) { setTransportMessage('Phrase is unavailable.'); return; }
    trackerEngine.queuePattern(null);
    setQueuedPatternIndex(index);
    setTransportMessage('PREPARING QUEUED PHRASE');
    const ids = pattern.tracks.flatMap((track) => track.steps.slice(0, pattern.length).map((step) => instrumentIdToPadId(step.instrumentId)))
      .filter((id): id is string => id !== null);
    void padBank.preparePads(ids).then(() => {
      if (request !== queueGeneration.current) return;
      const queued = trackerEngine.queuePattern(index);
      setTransportMessage('');
      if (!queued) setQueuedPatternIndex(null);
    }).catch((error: unknown) => {
      if (request !== queueGeneration.current) return;
      console.error('[SP-M8x] Could not cue phrase:', error);
      setQueuedPatternIndex(null);
      setTransportMessage(error instanceof Error ? error.message : 'Could not cue phrase.');
    });
  }, [padBank.preparePads, playing, starting]);

  const triggerPad = useCallback((padId: string, _onTriggered?: (time: number) => number | void, semitoneOffset = 0, pointerTime?: number, sliceIndex?: number, playThrough = false) => {
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
      const track = projectController.recordHit(position.patternIndex, position.step,
        state.sampler.pads[padId]?.targetTrack ?? 0, {
          note: chromaticNote(semitoneOffset), instrumentId, subTickOffset: position.subTickOffset, velocity: 127,
          ...(sliceIndex === undefined ? {} : { sliceIndex }),
        });
      if (track === null) {
        setTransportMessage(`Step ${position.step + 1} full — hit not recorded.`);
        return;
      }
      setTransportMessage('');
      if (gated) captured = { patternIndex: position.patternIndex, track, instrumentId, generation: startGeneration.current };
      return track;
    }, semitoneOffset, pointerTime, sliceIndex, playThrough);
    return (releasePointerTime?: number) => {
      release(releasePointerTime);
      if (!captured || !recordingRef.current || captured.generation !== startGeneration.current) return;
      const currentContext = audioEngine.getContext();
      const time = currentContext && releasePointerTime !== undefined && Number.isFinite(releasePointerTime)
        ? currentContext.currentTime + (releasePointerTime - performance.now()) / 1000 : currentContext?.currentTime;
      if (time === undefined) return;
      const position = trackerEngine.recordPosition(time);
      if (!position) return;
      if (position.patternIndex !== captured.patternIndex) {
        setTransportMessage('Gate crossed a phrase boundary — release not recorded.');
        return;
      }
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
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[var(--bg-canvas)] border-b border-[var(--border-grid)] shrink-0">
        <h1 className="text-xs font-black tracking-widest text-[var(--accent-phrase)]">SP-M8x <span className="text-zinc-500 font-normal">v0.9.2</span></h1>
        <nav className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-[var(--border-grid)]">
          {(['phrase', 'table', 'song', 'mixer', 'sampler'] as const).map((tab) => <button key={tab} type="button" aria-current={currentTab === tab ? 'page' : undefined} onClick={() => setCurrentTab(tab)}
            className={`px-3 py-1 text-[10px] font-bold tracking-wider rounded uppercase border ${currentTab === tab ? 'text-[var(--accent-phrase)] border-[var(--accent-phrase)] bg-cyan-950/40' : 'text-zinc-500 border-transparent'}`}>[ {tab} ]</button>)}
        </nav>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="transport-control" onClick={handleUndo}
            disabled={!projectController.canUndo()} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">UNDO</button>
          <button type="button" className="transport-control" onClick={handleRedo}
            disabled={!projectController.canRedo()} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">REDO</button>
          <button type="button" className="transport-control" onClick={() => void exportBundle()}
            disabled={bundleBusy || !padBank.storageReady}>EXPORT .SP8</button>
          <button type="button" className="transport-control" onClick={() => bundleInputRef.current?.click()}
            disabled={bundleBusy || !padBank.storageReady}>IMPORT .SP8</button>
          <input ref={bundleInputRef} className="hidden" type="file" accept=".sp8,application/json"
            aria-label="Import SP8 project bundle"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBundle(file);
            }} />
          {bundleStatus && <span role={bundleStatus.includes('FAILED') ? 'alert' : 'status'} className="text-[9px] text-cyan-300">{bundleStatus}</span>}
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden p-3 gap-3 bg-[var(--bg-shell-deep)]">
        {currentTab === 'phrase'
          ? <div className="phrase-workspace">
              <PhraseTableEditor slots={padBank.slots} activeStep={playing ? playhead : activeStep} transportBusy={playing || starting} mode="phrase" queuedPatternIndex={queuedPatternIndex} onSelectPattern={selectPattern} linkedPad={linkedPad} contextLock={contextLock} onToggleContextLock={toggleContextLock} />
              <SamplerWorkspace padBank={padBank} recorder={recorder} triggerPad={triggerPad} compact />
            </div>
          : currentTab === 'table'
            ? <PhraseTableEditor slots={padBank.slots} activeStep={playing ? playhead : activeStep} transportBusy={playing || starting} mode="table" queuedPatternIndex={queuedPatternIndex} onSelectPattern={selectPattern} linkedPad={linkedPad} contextLock={contextLock} onToggleContextLock={toggleContextLock} />
          : currentTab === 'sampler'
            ? <SamplerWorkspace padBank={padBank} recorder={recorder} triggerPad={triggerPad} />
            : <section className="flex-1 p-4 bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl">
                <h2 className="text-sm text-cyan-300 uppercase">{currentTab}</h2>
                {currentTab === 'song' ? <SongArrangementView isPlaying={playing} currentStep={playing ? playhead : activeStep} /> :
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
          <button type="button" aria-pressed={playing} onClick={toggleTransport} className="transport-control text-cyan-300">{starting ? 'CANCEL' : playing ? 'STOP' : 'PLAY'}</button>
          <button type="button" aria-pressed={armed} onClick={() => setArmed(!armed)} className={`transport-control ${armed ? 'text-rose-300' : 'text-zinc-400'}`}>{armed ? 'PHRASE REC ARMED' : 'PHRASE REC'}</button>
          <button type="button" aria-pressed={fillActive} onPointerDown={() => {
            setFillActive(true);
            trackerEngine.setFillActive(true);
          }} onPointerUp={() => {
            setFillActive(false);
            trackerEngine.setFillActive(false);
          }} onPointerCancel={() => {
            setFillActive(false);
            trackerEngine.setFillActive(false);
          }} onBlur={() => {
            setFillActive(false);
            trackerEngine.setFillActive(false);
          }} className={`transport-control ${fillActive ? 'text-amber-300' : 'text-zinc-500'}`}>FILL</button>
          <span>BPM: <strong className="text-zinc-200">{projectController.getState().settings.bpm.toFixed(1)}</strong></span>
          <MasterOutput savedLocally={padBank.storageReady && !padBank.storageError && !projectController.hasSaveError() && !['SAVING', 'DELETING'].includes(padBank.storageStatus)} />
          {padBank.storageError && <span role="alert" className="text-rose-400">{padBank.storageStatus}</span>}
          {projectController.hasSaveError() && <span role="alert" className="text-rose-400">PHRASE SAVE FAILED</span>}
          {transportMessage && <span role="alert" className="text-rose-400">{transportMessage}</span>}
          <span className="sr-only" aria-live="polite">Project revision {projectRevision}</span>
        </div>
      </footer>
    </div>
  );
};

export default SPM8xDashboard;
