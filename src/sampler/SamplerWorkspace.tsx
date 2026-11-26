/**
 * SP-M8x Hybrid Music Production Suite
 * SamplerWorkspace.tsx — Sampler view with workbench above the pad bank
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BANKS, type PadBankApi, type PadSlot } from './usePadBank';
import { chopToBankReplacingSingleSource } from './chopToBank';
import { PadBankManager } from './PadBankManager';
import SamplerWorkbench from './SamplerWorkbench';
import { useInputRecorder } from './useInputRecorder';
import { projectController } from '../project/projectController';
import { audioEngine } from '../audio/audioEngine';
import { createDefaultAHDSRParams, normalizeAHDSR, type AHDSRParams } from '../audio/ahdsr';
import { PerformanceDeckControls } from '../fx/PerformanceDeckControls';
import { FxStrip } from '../fx/FxStrip';
import { AudioWaveformCanvas, type AudioWaveformCanvasProps } from './AudioWaveformCanvas';

export interface SamplerWorkspaceProps {
  padBank: PadBankApi;
  recorder: ReturnType<typeof useInputRecorder>;
  triggerPad?: PadBankApi['triggerPad'];
  compact?: boolean;
  pad?: PadSlot;
}

export const SamplerWorkspace: React.FC<SamplerWorkspaceProps> = ({
  padBank,
  recorder,
  triggerPad = padBank.triggerPad,
  compact = false,
  pad,
}) => {
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [ahdsrOpen, setAhdsrOpen] = useState(false);
  const [, setProjectRevision] = useState(0);

  useEffect(() => {
    return projectController.subscribe(() => {
      setProjectRevision((rev) => rev + 1);
    });
  }, []);

  const project = projectController.getState();
  const selectedPadId = padBank.selectedPadId;
  const selectedPad = project.sampler.pads[selectedPadId];
  const activePadSlot = pad ?? padBank.selectedPad;
  const trackVolume = project.settings.trackVolumes?.[selectedPad?.targetTrack ?? 0] ?? 1;
  const activeAhdsr: AHDSRParams = normalizeAHDSR(
    selectedPad?.adsr ?? projectController.getPadAdsr(selectedPadId),
  );

  const applyPadAdsrToEngine = useCallback((padId: string, params: AHDSRParams) => {
    const normalized = normalizeAHDSR(params);
    const engine = audioEngine as unknown as {
      setPadAdsr?: (id: string, env: AHDSRParams) => void;
      setPadEnvelope?: (id: string, env: AHDSRParams) => void;
    };
    engine.setPadAdsr?.(padId, normalized);
    engine.setPadEnvelope?.(padId, normalized);
  }, []);

  useEffect(() => {
    applyPadAdsrToEngine(selectedPadId, activeAhdsr);
  }, [activeAhdsr, applyPadAdsrToEngine, selectedPadId]);

  const updateAhdsr = useCallback(
    (patch: Partial<AHDSRParams>) => {
      const next = normalizeAHDSR(projectController.setPadAdsr(selectedPadId, patch));
      applyPadAdsrToEngine(selectedPadId, next);
    },
    [applyPadAdsrToEngine, selectedPadId],
  );

  const resetPadAdsr = useCallback(
    (padId: string, reason: 'pad-cleared' | 'sample-loaded' | 'manual-reset' = 'manual-reset') => {
      const result = projectController.resetPadAdsr(padId, reason);
      const next = normalizeAHDSR(result?.adsr ?? createDefaultAHDSRParams());
      applyPadAdsrToEngine(padId, next);
    },
    [applyPadAdsrToEngine],
  );

  const resetPadsAdsr = useCallback(
    (padIds: readonly string[], reason: 'pad-cleared' | 'sample-loaded' | 'manual-reset' = 'manual-reset') => {
      for (const padId of padIds) {
        resetPadAdsr(padId, reason);
      }
    },
    [resetPadAdsr],
  );

  const handleDeletePads = useCallback<PadBankApi['deletePads']>(
    async (padIds) => {
      await padBank.deletePads(padIds);
      resetPadsAdsr(padIds, 'pad-cleared');
    },
    [padBank, resetPadsAdsr],
  );

  const handleLoadSample = useCallback<PadBankApi['loadSample']>(
    (padId, buffer, name, audio) => {
      const result = padBank.loadSample(padId, buffer, name, audio);
      resetPadAdsr(padId, 'sample-loaded');
      return result;
    },
    [padBank, resetPadAdsr],
  );

  const handleClearPad = useCallback(
    (padId: string) => {
      const activePatternIndex = projectController.getState().settings.activePatternIndex;
      projectController.clearPadSteps(activePatternIndex, padId);
      resetPadAdsr(padId, 'pad-cleared');
    },
    [resetPadAdsr],
  );

  const handleCropPad = useCallback(
    (padId: string) => {
      const slot = padBank.slots[padId];
      if (!slot) return;
      const startPct = Math.max(0, Math.min(99.9, Number.isFinite(slot.startPct) ? slot.startPct : 0));
      const endPct = Math.max(startPct + 0.1, Math.min(100, Number.isFinite(slot.endPct) ? slot.endPct : 100));
      const buffer: AudioBuffer | null = slot.buffer ?? null;

      if (buffer && buffer.length > 0 && typeof AudioContext !== 'undefined') {
        const startFrame = Math.max(0, Math.min(buffer.length - 1, Math.floor((startPct / 100) * buffer.length)));
        const endFrame = Math.max(startFrame + 1, Math.min(buffer.length, Math.ceil((endPct / 100) * buffer.length)));
        const croppedLength = endFrame - startFrame;

        try {
          const tempCtx = new AudioContext();
          const croppedBuffer = tempCtx.createBuffer(
            buffer.numberOfChannels,
            croppedLength,
            buffer.sampleRate,
          );
          for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const src = buffer.getChannelData(ch);
            const dst = croppedBuffer.getChannelData(ch);
            dst.set(src.subarray(startFrame, endFrame));
          }
          void tempCtx.close();

          const fallbackAudio =
            typeof Blob !== 'undefined'
              ? new Blob([new Float32Array(croppedLength)], { type: 'application/octet-stream' })
              : (undefined as unknown as Blob);
          padBank.loadSample(padId, croppedBuffer, slot.name, fallbackAudio);
          padBank.updatePad(padId, {
            startPct: 0,
            endPct: 100,
          });
          return;
        } catch {
          // Fallback to range trim normalization if AudioContext creation is unavailable
        }
      }

      padBank.updatePad(padId, {
        startPct,
        endPct,
      });
    },
    [padBank],
  );

  const handleTriggerPad = useCallback<PadBankApi['triggerPad']>(
    (padId, onTriggered, semitoneOffset, pointerTime, sliceIndex, playThrough) => {
      const padEnvelope = normalizeAHDSR(projectController.getPadAdsr(padId));
      applyPadAdsrToEngine(padId, padEnvelope);
      const release = triggerPad(padId, onTriggered, semitoneOffset, pointerTime, sliceIndex, playThrough);
      const context = audioEngine.getContext();
      if (context && context.state === 'running') {
        const buffer = padBank.slots[padId]?.buffer as AudioBuffer | undefined;
        if (buffer) {
          audioEngine.getPadPlaybackPosition(padId, buffer);
        }
      }
      return release;
    },
    [applyPadAdsrToEngine, padBank.slots, triggerPad],
  );

  const renderWaveform = useCallback(
    (props: Omit<AudioWaveformCanvasProps, 'audioBuffer'>) => (
      <AudioWaveformCanvas
        audioBuffer={activePadSlot.buffer}
        padId={activePadSlot.id}
        {...props}
      />
    ),
    [activePadSlot.buffer, activePadSlot.id],
  );

  const chopToBank = useCallback(
    (padId: string, bank: (typeof BANKS)[number], count: number) =>
      chopToBankReplacingSingleSource(padBank, padId, bank, count),
    [padBank],
  );

  return (
    <div className={`${compact ? 'sampler-compact' : 'sampler-full'} flex-1 grid gap-3 overflow-hidden min-h-0`}>
      <div className="sampler-full-pads bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between border-b border-[var(--border-grid)] pb-2">
          <span className="text-[10px] font-bold text-[var(--accent-phrase)] tracking-wider">PAD BANKS</span>
          <label className="control-block">
            TRK
            <select
              aria-label="Selected pad target track"
              className="bg-zinc-950 text-zinc-300"
              value={selectedPad?.targetTrack ?? 0}
              onChange={(event) =>
                projectController.setPadTargetTrack(selectedPadId, Number(event.target.value))
              }
            >
              {Array.from({ length: 8 }, (_, index) => (
                <option key={index} value={index}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="control-block">
            CHOKE
            <select
              aria-label="Pad choke group"
              className="bg-zinc-950 text-zinc-300"
              value={selectedPad?.chokeGroup ?? ''}
              onChange={(event) =>
                projectController.setPadChokeGroup(
                  selectedPadId,
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">OFF</option>
              {Array.from({ length: 8 }, (_, index) => (
                <option key={index} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="compact-block-button"
            aria-label="Toggle pad and track volume controls"
            aria-expanded={volumeOpen}
            onClick={() => setVolumeOpen((open) => !open)}
          >
            VOL
          </button>
          <button
            type="button"
            className="compact-block-button"
            aria-label="Toggle AHDSR envelope controls"
            aria-expanded={ahdsrOpen}
            onClick={() => setAhdsrOpen((open) => !open)}
          >
            AHDSR
          </button>
          <div className="flex gap-1">
            {BANKS.map((bank) => (
              <button
                key={bank}
                type="button"
                onClick={() => padBank.setActiveBank(bank)}
                aria-label={`Bank ${bank}`}
                title={`Bank ${bank}`}
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
        {volumeOpen && (
          <div className="volume-drawer">
            <label>
              PAD {selectedPadId}
              <input
                aria-label="Selected pad volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedPad?.volume ?? 1}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  projectController.setPadVolume(selectedPadId, value);
                  audioEngine.setPadVolume(selectedPadId, value);
                }}
              />
            </label>
            <label>
              TRACK {(selectedPad?.targetTrack ?? 0) + 1}
              <input
                aria-label="Selected track volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={trackVolume}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  projectController.setTrackVolume(selectedPad?.targetTrack ?? 0, value);
                  audioEngine.setTrackVolume(selectedPad?.targetTrack ?? 0, value);
                }}
              />
            </label>
          </div>
        )}
        {ahdsrOpen && (
          <div
            className="ahdsr-drawer grid grid-cols-6 gap-2 p-2 rounded border border-zinc-800 bg-zinc-950/90 text-[10px]"
            aria-label="Pad AHDSR envelope controls"
          >
            <label className="flex flex-col gap-1">
              <span>ATK {Math.round(activeAhdsr.attackTime * 1000)}ms</span>
              <input
                aria-label="Envelope attack time"
                type="range"
                min="0"
                max="2"
                step="0.005"
                value={activeAhdsr.attackTime}
                onChange={(event) => updateAhdsr({ attackTime: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>HOLD {Math.round(activeAhdsr.holdTime * 1000)}ms</span>
              <input
                aria-label="Envelope hold time"
                type="range"
                min="0"
                max="2"
                step="0.005"
                value={activeAhdsr.holdTime}
                onChange={(event) => updateAhdsr({ holdTime: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>DEC {Math.round(activeAhdsr.decayTime * 1000)}ms</span>
              <input
                aria-label="Envelope decay time"
                type="range"
                min="0.005"
                max="3"
                step="0.005"
                value={activeAhdsr.decayTime}
                onChange={(event) => updateAhdsr({ decayTime: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>SUS {Math.round(activeAhdsr.sustainLevel * 100)}%</span>
              <input
                aria-label="Envelope sustain level"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={activeAhdsr.sustainLevel}
                onChange={(event) => updateAhdsr({ sustainLevel: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>REL {Math.round(activeAhdsr.releaseTime * 1000)}ms</span>
              <input
                aria-label="Envelope release time"
                type="range"
                min="0.005"
                max="3"
                step="0.005"
                value={activeAhdsr.releaseTime}
                onChange={(event) => updateAhdsr({ releaseTime: Number(event.target.value) })}
              />
            </label>
            <div className="flex items-center justify-end">
              <button
                type="button"
                aria-label="Reset AHDSR envelope to default"
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
                onClick={() => resetPadAdsr(selectedPadId, 'manual-reset')}
              >
                RESET
              </button>
            </div>
          </div>
        )}
        <PadBankManager
          slots={padBank.slots}
          activeBank={padBank.activeBank}
          selectedPadId={selectedPadId}
          padPlayMode={padBank.padPlayMode}
          chromaticRootOffset={padBank.chromaticRootOffset}
          setPadPlayMode={padBank.setPadPlayMode}
          setChromaticRootOffset={padBank.setChromaticRootOffset}
          triggerPad={handleTriggerPad}
          deletePads={handleDeletePads}
          copyPad={padBank.copyPad}
          storageReady={padBank.storageReady}
          updatePad={padBank.updatePad}
          onClearPad={handleClearPad}
          onCropPad={handleCropPad}
          sliActive={
            Boolean(selectedPad?.sliActive) &&
            activePadSlot.sliceMarkers.length >= 2 &&
            padBank.padPlayMode === 'BANK_64'
          }
          setSliActive={(active) =>
            projectController.updatePadMetadata(selectedPadId, { sliActive: active })
          }
        />
      </div>
      {!compact && (
        <SamplerWorkbench
          pad={activePadSlot}
          onUpdatePad={padBank.updatePad}
          onPreviewRange={padBank.previewRange}
          onLoadSample={handleLoadSample}
          getPadSettings={padBank.getPadSettings}
          recordingStatus={recorder.status}
          onRecord={recorder.toggle}
          storageReady={padBank.storageReady}
          activeBank={padBank.activeBank}
          onChop={chopToBank}
          onGenerateSliceMarkers={padBank.generateSliceMarkers}
          renderWaveform={renderWaveform}
          onResetPadAdsr={resetPadAdsr}
        />
      )}
    </div>
  );
};

export default SamplerWorkspace;