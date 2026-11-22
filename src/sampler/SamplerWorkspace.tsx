/**
 * SP-M8x Hybrid Music Production Suite
 * SamplerWorkspace.tsx — Sampler view with workbench above the pad bank
 */

import React, { useCallback, useState } from 'react';
import { BANKS, type PadBankApi } from './usePadBank';
import { chopToBankReplacingSingleSource } from './chopToBank';
import { PadBankManager } from './PadBankManager';
import { SamplerWorkbench } from './SamplerWorkbench';
import { useInputRecorder } from './useInputRecorder';
import { projectController } from '../project/projectController';
import { audioEngine } from '../audio/audioEngine';
import { type AHDSRParams } from '../audio/ahdsr';
import { PerformanceDeckControls } from '../fx/PerformanceDeckControls';
import { FxStrip } from '../fx/FxStrip';
import { AudioWaveformCanvas, type AudioWaveformCanvasProps } from './AudioWaveformCanvas';

export interface SamplerWorkspaceProps {
  padBank: PadBankApi;
  recorder: ReturnType<typeof useInputRecorder>;
  triggerPad?: PadBankApi['triggerPad'];
  compact?: boolean;
}

const DEFAULT_AHDSR: AHDSRParams = {
  attackTime: 0.002,
  holdTime: 0,
  decayTime: 0.08,
  sustainLevel: 1,
  releaseTime: 0.03,
};

export const SamplerWorkspace: React.FC<SamplerWorkspaceProps> = ({
  padBank,
  recorder,
  triggerPad = padBank.triggerPad,
  compact = false,
}) => {
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [ahdsrOpen, setAhdsrOpen] = useState(false);
  const [padEnvelopes, setPadEnvelopes] = useState<Record<string, AHDSRParams>>({});
  const project = projectController.getState();
  const selectedPad = project.sampler.pads[padBank.selectedPadId];
  const trackVolume = project.settings.trackVolumes?.[selectedPad.targetTrack] ?? 1;
  const activeAhdsr = padEnvelopes[padBank.selectedPadId] ?? DEFAULT_AHDSR;

  const updateAhdsr = useCallback((patch: Partial<AHDSRParams>) => {
    setPadEnvelopes((prev) => {
      const current = prev[padBank.selectedPadId] ?? DEFAULT_AHDSR;
      return {
        ...prev,
        [padBank.selectedPadId]: {
          ...current,
          ...patch,
        },
      };
    });
  }, [padBank.selectedPadId]);

  const handleTriggerPad = useCallback<PadBankApi['triggerPad']>((
    padId,
    onTriggered,
    semitoneOffset,
    pointerTime,
    sliceIndex,
    playThrough,
  ) => {
    const envelope = padEnvelopes[padId] ?? DEFAULT_AHDSR;
    const release = triggerPad(padId, onTriggered, semitoneOffset, pointerTime, sliceIndex, playThrough);
    const context = audioEngine.getContext();
    if (context && context.state === 'running') {
      const startAt = pointerTime !== undefined && Number.isFinite(pointerTime)
        ? Math.max(context.currentTime, context.currentTime + (pointerTime - performance.now()) / 1000)
        : context.currentTime;
      const activeVoiceId = audioEngine.getPadPlaybackPosition(padId, padBank.slots[padId]?.buffer as AudioBuffer);
      void activeVoiceId;
      void startAt;
      void envelope;
    }
    return release;
  }, [padEnvelopes, padBank.slots, triggerPad]);

  const renderWaveform = useCallback((props: Omit<AudioWaveformCanvasProps, 'audioBuffer'>) => (
    <AudioWaveformCanvas audioBuffer={padBank.selectedPad.buffer} {...props} />
  ), [padBank.selectedPad.buffer]);

  const chopToBank = useCallback((padId: string, bank: (typeof BANKS)[number], count: number) =>
    chopToBankReplacingSingleSource(padBank, padId, bank, count), [padBank]);

  return (
    <div className={`${compact ? 'sampler-compact' : 'sampler-full'} flex-1 grid gap-3 overflow-hidden min-h-0`}>
      <div className="sampler-full-pads bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between border-b border-[var(--border-grid)] pb-2">
          <span className="text-[10px] font-bold text-[var(--accent-phrase)] tracking-wider">PAD BANKS</span>
          <label className="control-block">TRK
            <select aria-label="Selected pad target track" className="bg-zinc-950 text-zinc-300"
              value={selectedPad.targetTrack}
              onChange={(event) => projectController.setPadTargetTrack(padBank.selectedPadId, Number(event.target.value))}>
              {Array.from({ length: 8 }, (_, index) => <option key={index} value={index}>{index + 1}</option>)}
            </select>
          </label>
          <label className="control-block">CHOKE
            <select aria-label="Pad choke group" className="bg-zinc-950 text-zinc-300"
              value={selectedPad.chokeGroup ?? ''}
              onChange={(event) => projectController.setPadChokeGroup(padBank.selectedPadId, event.target.value ? Number(event.target.value) : null)}>
              <option value="">OFF</option>
              {Array.from({ length: 8 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
          <button type="button" className="compact-block-button" aria-label="Toggle pad and track volume controls"
            aria-expanded={volumeOpen} onClick={() => setVolumeOpen((open) => !open)}>VOL</button>
          <button type="button" className="compact-block-button" aria-label="Toggle AHDSR envelope controls"
            aria-expanded={ahdsrOpen} onClick={() => setAhdsrOpen((open) => !open)}>AHDSR</button>
          <div className="flex gap-1">
            {BANKS.map((bank) => (
              <button
                key={bank}
                type="button"
                onClick={() => padBank.setActiveBank(bank)}
                aria-label={`Bank ${bank}`} title={`Bank ${bank}`}
                className={`bank-block text-[9px] px-2 py-0.5 font-bold ${
                  padBank.activeBank === bank ? 'bg-cyan-900 text-cyan-200' : 'bg-zinc-900 text-zinc-400'
                }`}
              >
                {bank}
              </button>
            ))}
          </div>
        </div>
        {compact && <PerformanceDeckControls />}
        <FxStrip />
        {volumeOpen && <div className="volume-drawer">
          <label>PAD {padBank.selectedPadId}
            <input aria-label="Selected pad volume" type="range" min="0" max="1" step="0.01" value={selectedPad.volume}
            onChange={(event) => {
              const value = Number(event.target.value);
              projectController.setPadVolume(padBank.selectedPadId, value);
              audioEngine.setPadVolume(padBank.selectedPadId, value);
            }} />
          </label>
          <label>TRACK {selectedPad.targetTrack + 1}
            <input aria-label="Selected track volume" type="range" min="0" max="1" step="0.01" value={trackVolume}
              onChange={(event) => {
                const value = Number(event.target.value);
                projectController.setTrackVolume(selectedPad.targetTrack, value);
                audioEngine.setTrackVolume(selectedPad.targetTrack, value);
              }} />
          </label>
        </div>}
        {ahdsrOpen && (
          <div className="ahdsr-drawer grid grid-cols-5 gap-2 p-2 rounded border border-zinc-800 bg-zinc-950/90 text-[10px]" aria-label="Pad AHDSR envelope controls">
            <label className="flex flex-col gap-1">
              <span>ATK {Math.round(activeAhdsr.attackTime * 1000)}ms</span>
              <input aria-label="Envelope attack time" type="range" min="0" max="2" step="0.005"
                value={activeAhdsr.attackTime}
                onChange={(event) => updateAhdsr({ attackTime: Number(event.target.value) })} />
            </label>
            <label className="flex flex-col gap-1">
              <span>HOLD {Math.round(activeAhdsr.holdTime * 1000)}ms</span>
              <input aria-label="Envelope hold time" type="range" min="0" max="2" step="0.005"
                value={activeAhdsr.holdTime}
                onChange={(event) => updateAhdsr({ holdTime: Number(event.target.value) })} />
            </label>
            <label className="flex flex-col gap-1">
              <span>DEC {Math.round(activeAhdsr.decayTime * 1000)}ms</span>
              <input aria-label="Envelope decay time" type="range" min="0.005" max="3" step="0.005"
                value={activeAhdsr.decayTime}
                onChange={(event) => updateAhdsr({ decayTime: Number(event.target.value) })} />
            </label>
            <label className="flex flex-col gap-1">
              <span>SUS {Math.round(activeAhdsr.sustainLevel * 100)}%</span>
              <input aria-label="Envelope sustain level" type="range" min="0" max="1" step="0.01"
                value={activeAhdsr.sustainLevel}
                onChange={(event) => updateAhdsr({ sustainLevel: Number(event.target.value) })} />
            </label>
            <label className="flex flex-col gap-1">
              <span>REL {Math.round(activeAhdsr.releaseTime * 1000)}ms</span>
              <input aria-label="Envelope release time" type="range" min="0.005" max="3" step="0.005"
                value={activeAhdsr.releaseTime}
                onChange={(event) => updateAhdsr({ releaseTime: Number(event.target.value) })} />
            </label>
          </div>
        )}
        <PadBankManager
          slots={padBank.slots}
          activeBank={padBank.activeBank}
          selectedPadId={padBank.selectedPadId}
          padPlayMode={padBank.padPlayMode}
          chromaticRootOffset={padBank.chromaticRootOffset}
          setPadPlayMode={padBank.setPadPlayMode}
          setChromaticRootOffset={padBank.setChromaticRootOffset}
          triggerPad={handleTriggerPad}
          deletePads={padBank.deletePads}
          copyPad={padBank.copyPad}
          storageReady={padBank.storageReady}
          updatePad={padBank.updatePad}
          sliActive={selectedPad.sliActive && padBank.selectedPad.sliceMarkers.length >= 2 && padBank.padPlayMode === 'BANK_64'}
          setSliActive={(active) => projectController.updatePadMetadata(padBank.selectedPadId, { sliActive: active })}
        />
      </div>
      {!compact && <SamplerWorkbench
        pad={padBank.selectedPad}
        onUpdatePad={padBank.updatePad}
        onPreviewRange={padBank.previewRange}
        onLoadSample={padBank.loadSample}
        getPadSettings={padBank.getPadSettings}
        recordingStatus={recorder.status}
        onRecord={recorder.toggle}
        storageReady={padBank.storageReady}
        activeBank={padBank.activeBank}
        onChop={chopToBank}
        onGenerateSliceMarkers={padBank.generateSliceMarkers}
        renderWaveform={renderWaveform}
      />}
    </div>
  );
};

export default SamplerWorkspace;