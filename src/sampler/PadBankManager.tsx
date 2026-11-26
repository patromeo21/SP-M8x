import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BANKS, type PadBankApi, type PadSlot } from './usePadBank';
import type { BankId } from '../project/projectController';
import type { PadPlayMode } from './chromatic';
import { projectController } from '../project/projectController';
import { padIdToInstrumentId } from './padIds';

export type { PadPlayMode };

export interface PadBankManagerProps {
  slots: Record<string, PadSlot>;
  activeBank: BankId;
  selectedPadId: string;
  padPlayMode: PadPlayMode;
  chromaticRootOffset: number;
  setPadPlayMode: (mode: PadPlayMode) => void;
  setChromaticRootOffset: (offset: number) => void;
  triggerPad: PadBankApi['triggerPad'];
  deletePads: PadBankApi['deletePads'];
  copyPad: PadBankApi['copyPad'];
  storageReady: boolean;
  updatePad: PadBankApi['updatePad'];
  sliActive: boolean;
  setSliActive: (active: boolean) => void;
  onClearPad?: (padId: string) => void;
  onCropPad?: (padId: string) => void;
  isEraseHeld?: boolean;
  onToggleEraseHold?: (held: boolean, targetPadId?: string | null) => void;
  isTransportPlaying?: boolean;
  isRecording?: boolean;
  activePatternIndex?: number;
  activeStepIndex?: number;
  activeSubtickIndex?: number;
}

const BANK_PAD_INDICES = Array.from({ length: 16 }, (_, index) => index + 1);

function getBankPadIds(bank: BankId): string[] {
  return BANK_PAD_INDICES.map((index) => `${bank}${index}`);
}

function formatSemitoneLabel(semitoneOffset: number): string {
  if (semitoneOffset === 0) return 'ROOT 0';
  return semitoneOffset > 0 ? `+${semitoneOffset} ST` : `${semitoneOffset} ST`;
}

function formatPadPitchLabel(pitch: number): string {
  if (pitch === 0) return '0 ST';
  return pitch > 0 ? `+${pitch} ST` : `${pitch} ST`;
}

function clampPitchSemitones(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0;
  return Math.max(-24, Math.min(24, Math.round(pitch)));
}

export const PadBankManager: React.FC<PadBankManagerProps> = ({
  slots,
  activeBank,
  selectedPadId,
  padPlayMode,
  chromaticRootOffset,
  setPadPlayMode,
  setChromaticRootOffset,
  triggerPad,
  deletePads,
  copyPad,
  storageReady,
  updatePad,
  sliActive,
  setSliActive,
  onClearPad,
  onCropPad,
  isEraseHeld = false,
  onToggleEraseHold,
  isTransportPlaying = false,
  isRecording = false,
  activePatternIndex,
  activeStepIndex,
  activeSubtickIndex,
}) => {
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);
  const [confirmPending, setConfirmPending] = useState(false);
  const [copySourcePadId, setCopySourcePadId] = useState<string | null>(null);
  const [copyTargetPadIds, setCopyTargetPadIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [localEraseHeld, setLocalEraseHeld] = useState(false);

  const effectiveEraseHeld = onToggleEraseHold ? isEraseHeld : localEraseHeld;
  const effectivePlayMode: PadPlayMode =
    padPlayMode === ('CHORD' as PadPlayMode) ? 'BANK_64' : padPlayMode;
  const bankPadIds = useMemo(() => getBankPadIds(activeBank), [activeBank]);
  const selectedSlot = slots[selectedPadId];
  const selectedPadPitch = clampPitchSemitones(selectedSlot?.pitch ?? 0);

  useEffect(() => {
    if (padPlayMode === ('CHORD' as PadPlayMode)) {
      setPadPlayMode('BANK_64');
    }
  }, [padPlayMode, setPadPlayMode]);

  useEffect(() => {
    setConfirmPending(false);
  }, [selectedForDelete]);

  useEffect(() => {
    setDeleteMode(false);
    setSelectedForDelete([]);
    setConfirmPending(false);
    setCopySourcePadId(null);
    setCopyTargetPadIds([]);
  }, [activeBank]);

  const setEraseState = useCallback(
    (held: boolean, targetPadId?: string | null) => {
      if (onToggleEraseHold) {
        onToggleEraseHold(held, targetPadId);
      } else {
        setLocalEraseHeld(held);
      }
      projectController.setLiveEraseHold(held, targetPadId ?? null);
    },
    [onToggleEraseHold],
  );

  const adjustSelectedPadPitch = useCallback(
    (delta: number) => {
      if (!selectedPadId) return;
      const nextPitch = clampPitchSemitones(selectedPadPitch + delta);
      updatePad(selectedPadId, { pitch: nextPitch });
      setStatusMessage(`PAD ${selectedPadId} PITCH ${formatPadPitchLabel(nextPitch)}`);
    },
    [selectedPadId, selectedPadPitch, updatePad],
  );

  const handleCropClick = useCallback(() => {
    const targetPadId = selectedPadId || bankPadIds[0];
    if (!targetPadId) return;
    if (onCropPad) {
      onCropPad(targetPadId);
      setStatusMessage(`CROPPED ${targetPadId} TO S/E FULL VIEW`);
      return;
    }
    const targetSlot = slots[targetPadId];
    const bufferLength = targetSlot?.buffer?.length ?? 0;
    if (bufferLength > 0) {
      const startFrame = Math.max(
        0,
        Math.min(bufferLength - 1, Math.round((targetSlot.startPct / 100) * bufferLength)),
      );
      const endFrame = Math.max(
        startFrame + 1,
        Math.min(bufferLength, Math.round((targetSlot.endPct / 100) * bufferLength)),
      );
      updatePad(targetPadId, {
        startPct: (startFrame / bufferLength) * 100,
        endPct: (endFrame / bufferLength) * 100,
      });
    }
    setStatusMessage(`CROPPED ${targetPadId} TO S/E FULL VIEW`);
  }, [bankPadIds, onCropPad, selectedPadId, slots, updatePad]);

  const toggleDeleteSelection = useCallback((padId: string) => {
    setSelectedForDelete((prev) =>
      prev.includes(padId) ? prev.filter((id) => id !== padId) : [...prev, padId],
    );
  }, []);

  const toggleCopyTarget = useCallback((padId: string) => {
    setCopyTargetPadIds((prev) =>
      prev.includes(padId) ? prev.filter((id) => id !== padId) : [...prev, padId],
    );
  }, []);

  const handleApplyMultiCopy = useCallback(async () => {
    if (!copySourcePadId || copyTargetPadIds.length === 0) return;
    const sourceId = copySourcePadId;
    const targets = copyTargetPadIds.filter((id) => id !== sourceId);
    const copied: string[] = [];
    for (const destId of targets) {
      await Promise.resolve(copyPad(sourceId, destId));
      copied.push(destId);
    }
    setCopySourcePadId(null);
    setCopyTargetPadIds([]);
    if (copied.length > 0) {
      setStatusMessage(`COPIED ${sourceId} -> ${copied.join(', ')}`);
    }
  }, [copyPad, copySourcePadId, copyTargetPadIds]);

  const handleConfirmDelete = useCallback(async () => {
    if (selectedForDelete.length === 0) return;
    const targets = [...selectedForDelete];
    await deletePads(targets);
    setSelectedForDelete([]);
    setConfirmPending(false);
    setDeleteMode(false);
    setStatusMessage(`DELETED ${targets.join(', ')}`);
  }, [deletePads, selectedForDelete]);

  const handleClearPadClick = useCallback(() => {
    const targetPadId = selectedPadId || bankPadIds[0];
    if (!targetPadId) return;
    if (onClearPad) {
      onClearPad(targetPadId);
      setStatusMessage(`CLEARED ${targetPadId} & RESET AHDSR`);
      return;
    }
    const patternIndex =
      activePatternIndex ?? projectController.getState().settings.activePatternIndex;
    const cleared = projectController.clearPadSteps(patternIndex, targetPadId);
    projectController.resetPadAdsr(targetPadId, 'pad-cleared');
    setStatusMessage(`CLEARED ${cleared} ON ${targetPadId} & RESET AHDSR`);
  }, [activePatternIndex, bankPadIds, onClearPad, selectedPadId]);

  const handlePadPress = useCallback(
    (padId: string, padIndex: number) => {
      if (deleteMode) {
        toggleDeleteSelection(padId);
        return;
      }

      if (copySourcePadId) {
        if (copySourcePadId === padId) {
          setCopySourcePadId(null);
          setCopyTargetPadIds([]);
          return;
        }
        toggleCopyTarget(padId);
        return;
      }

      const instrumentId = padIdToInstrumentId(padId);
      const semitoneOffset =
        effectivePlayMode === 'CHROMATIC_16' ? chromaticRootOffset + (padIndex - 1) : 0;

      if (effectiveEraseHeld) {
        const state = projectController.getState();
        const patternIndex = activePatternIndex ?? state.settings.activePatternIndex;
        const eraseState = projectController.setLiveEraseHold(true, padId);
        const recordingActive = isRecording || eraseState.isRecording;
        const blockedByMasterBus = recordingActive && eraseState.activeBus === 'MST';

        if (blockedByMasterBus) {
          setStatusMessage('MST BUS ACTIVE — LIVE STEP ERASE BLOCKED');
          return;
        }

        if (
          isTransportPlaying &&
          typeof activeStepIndex === 'number' &&
          activeStepIndex >= 0
        ) {
          const erased = projectController.erasePadAtStep(
            patternIndex,
            activeStepIndex,
            padId,
            activeSubtickIndex,
          );
          const subtickLabel =
            typeof activeSubtickIndex === 'number' && activeSubtickIndex >= 0
              ? ` SUB ${activeSubtickIndex + 1}`
              : '';
          setStatusMessage(
            erased
              ? `ERASED ${padId} @ STEP ${activeStepIndex + 1}${subtickLabel}${recordingActive ? ' (LIVE REC)' : ''}`
              : `NO ${padId} EVENT AT STEP ${activeStepIndex + 1}${subtickLabel}`,
          );
          return;
        }

        if (instrumentId !== null) {
          projectController.setLiveEraseTargetPad(padId);
        }
        setStatusMessage(
          isTransportPlaying
            ? `ERASE ARMED FOR ${padId} — WAITING FOR ACTIVE STEP`
            : `ERASE ARMED FOR ${padId} (TRANSPORT STOPPED)`,
        );
        return;
      }

      void triggerPad(
        padId,
        undefined,
        semitoneOffset,
        undefined,
        sliActive ? padIndex : undefined,
        false,
      );
    },
    [
      activePatternIndex,
      activeStepIndex,
      activeSubtickIndex,
      chromaticRootOffset,
      copySourcePadId,
      deleteMode,
      effectiveEraseHeld,
      effectivePlayMode,
      isRecording,
      isTransportPlaying,
      sliActive,
      toggleCopyTarget,
      toggleDeleteSelection,
      triggerPad,
    ],
  );

  return (
    <div className="pad-bank-manager flex flex-col gap-2 min-h-0">
      <div className="pad-utility-bar flex flex-wrap items-center justify-between gap-1 text-[9px] font-mono">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!storageReady || !selectedPadId}
            aria-label={`Clear pad ${selectedPadId}`}
            onClick={handleClearPadClick}
            className="compact-block-button px-2 py-0.5 font-bold text-amber-300 disabled:opacity-40"
          >
            CLR
          </button>
          <button
            type="button"
            aria-pressed={effectiveEraseHeld}
            aria-label="Hold to erase pad steps or subticks"
            onClick={() => setEraseState(!effectiveEraseHeld, selectedPadId || null)}
            className={`compact-block-button px-2 py-0.5 font-bold ${
              effectiveEraseHeld ? 'bg-rose-900 text-rose-200' : 'text-zinc-300'
            }`}
          >
            ERASE
          </button>
          <button
            type="button"
            disabled={!storageReady}
            onClick={() => {
              setDeleteMode((prev) => !prev);
              setConfirmPending(false);
              setSelectedForDelete([]);
            }}
            className={`compact-block-button px-2 py-0.5 font-bold ${
              deleteMode ? 'bg-rose-950 text-rose-300' : 'text-zinc-300'
            }`}
          >
            {deleteMode ? 'CANCEL DEL' : 'DEL'}
          </button>
          {deleteMode && selectedForDelete.length > 0 && !confirmPending && (
            <button
              type="button"
              onClick={() => setConfirmPending(true)}
              className="compact-block-button px-2 py-0.5 font-bold text-rose-300"
            >
              DELETE {selectedForDelete.length}
            </button>
          )}
          {deleteMode && confirmPending && (
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              className="compact-block-button bg-rose-900 px-2 py-0.5 font-bold text-rose-100"
            >
              CONFIRM DELETE
            </button>
          )}
          <button
            type="button"
            disabled={!storageReady || !selectedPadId}
            onClick={() => {
              if (copySourcePadId === selectedPadId) {
                setCopySourcePadId(null);
                setCopyTargetPadIds([]);
              } else {
                setCopySourcePadId(selectedPadId);
                setCopyTargetPadIds([]);
                setStatusMessage(`SELECT 1+ TARGET PADS TO COPY ${selectedPadId}`);
              }
            }}
            className={`compact-block-button px-2 py-0.5 font-bold ${
              copySourcePadId ? 'bg-cyan-900 text-cyan-200' : 'text-zinc-300'
            }`}
          >
            {copySourcePadId ? `COPY ${copySourcePadId}…` : 'COPY'}
          </button>
          {copySourcePadId && copyTargetPadIds.length > 0 && (
            <button
              type="button"
              onClick={() => void handleApplyMultiCopy()}
              className="compact-block-button bg-cyan-900 px-2 py-0.5 font-bold text-cyan-100"
            >
              PASTE ({copyTargetPadIds.length})
            </button>
          )}
          <button
            type="button"
            disabled={!storageReady || !selectedPadId || !selectedSlot?.buffer}
            aria-label={`Crop pad ${selectedPadId} to S/E markers`}
            onClick={handleCropClick}
            className="compact-block-button px-2 py-0.5 font-bold text-cyan-300 disabled:opacity-40"
          >
            CROP
          </button>
          <button
            type="button"
            aria-pressed={sliActive}
            onClick={() => setSliActive(!sliActive)}
            className={`compact-block-button px-2 py-0.5 font-bold ${
              sliActive ? 'bg-cyan-900 text-cyan-200' : 'text-zinc-400'
            }`}
          >
            SLI
          </button>
          <div className="flex items-center gap-0.5 ml-1" aria-label="Pad semitone pitch">
            <button
              type="button"
              disabled={!storageReady || !selectedPadId}
              aria-label="Tune selected pad pitch down 1 semitone"
              onClick={() => adjustSelectedPadPitch(-1)}
              className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 disabled:opacity-40"
            >
              -
            </button>
            <span className="text-zinc-300 px-1 tabular-nums">
              {selectedPadId} {formatPadPitchLabel(selectedPadPitch)}
            </span>
            <button
              type="button"
              disabled={!storageReady || !selectedPadId}
              aria-label="Tune selected pad pitch up 1 semitone"
              onClick={() => adjustSelectedPadPitch(1)}
              className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {(['BANK_64', 'CHROMATIC_16'] as PadPlayMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPadPlayMode(mode)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                effectivePlayMode === mode ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              {mode === 'BANK_64' ? 'PAD' : 'CHR'}
            </button>
          ))}
          {effectivePlayMode === 'CHROMATIC_16' && (
            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                aria-label="Transpose chromatic root down"
                onClick={() => setChromaticRootOffset(chromaticRootOffset - 1)}
                className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300"
              >
                -
              </button>
              <span className="text-zinc-300">{formatSemitoneLabel(chromaticRootOffset)}</span>
              <button
                type="button"
                aria-label="Transpose chromatic root up"
                onClick={() => setChromaticRootOffset(chromaticRootOffset + 1)}
                className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pad-grid grid grid-cols-4 gap-1.5">
        {bankPadIds.map((padId, idx) => {
          const padIndex = idx + 1;
          const slot = slots[padId];
          const isSelected = padId === selectedPadId;
          const isMarkedForDelete = selectedForDelete.includes(padId);
          const isCopySource = copySourcePadId === padId;
          const isCopyTarget = copyTargetPadIds.includes(padId);
          const hasSample = Boolean(slot?.buffer || slot?.sampleKey);

          return (
            <button
              key={padId}
              type="button"
              onClick={() => handlePadPress(padId, padIndex)}
              aria-label={`Pad ${padId}`}
              className={`pad-tile rounded border p-2 text-left font-mono transition ${
                isMarkedForDelete
                  ? 'border-rose-500 bg-rose-950/60 text-rose-200'
                  : isCopySource || isCopyTarget
                    ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200'
                    : isSelected
                      ? 'border-amber-400 bg-zinc-800/90 text-zinc-100'
                      : hasSample
                        ? 'border-zinc-700 bg-zinc-900/90 text-zinc-200'
                        : 'border-zinc-800 bg-zinc-950/70 text-zinc-500'
              }`}
            >
              <div className="flex items-center justify-between text-[9px] font-bold">
                <span>{padId}</span>
                <span>
                  {effectivePlayMode === 'CHROMATIC_16'
                    ? formatSemitoneLabel(chromaticRootOffset + idx)
                    : ''}
                </span>
              </div>
              <div className="truncate text-[9px] mt-0.5">
                {slot?.name || `EMPTY ${padId}`}
              </div>
            </button>
          );
        })}
      </div>

      {statusMessage && (
        <div role="status" className="text-[9px] font-mono text-amber-300">
          {statusMessage}
        </div>
      )}
    </div>
  );
};

export default PadBankManager;
