/**
 * SP-M8x Hybrid Music Production Suite
 * usePadBank.ts — Shared pad state (banks A-D) bridging the UI to the single audio engine
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import type { BankId } from '../project/projectController';
import { deletePads, readStoredAudio, readStoredPads, savePadSettings, saveSample, saveSlices, type PlaybackMode, type StoredPad } from './padStorage';
import { percentFromFrame, rangeFromPercent } from './sampleRange';
import { gridSliceRanges } from './gridSlices';

export const BANKS: readonly BankId[] = ['A', 'B', 'C', 'D'];
export const PADS_PER_BANK = 16;

export interface PadSlot {
  id: string; // canonical pad id, e.g. "A1" .. "D16"
  name: string;
  buffer: AudioBuffer | null;
  sampleKey: string | null;
  loading: boolean;
  startPct: number; // 0-100
  endPct: number; // 0-100
  pitch: number; // semitones
  playbackMode: PlaybackMode;
}

export type PadSlotPatch = Partial<Pick<PadSlot, 'startPct' | 'endPct' | 'pitch' | 'playbackMode'>>;

export interface PadBankApi {
  slots: Record<string, PadSlot>;
  activeBank: BankId;
  selectedPadId: string;
  selectedPad: PadSlot;
  setActiveBank: (bank: BankId) => void;
  selectPad: (padId: string) => void;
  loadSample: (padId: string, buffer: AudioBuffer, name: string, audio: Blob) => void;
  updatePad: (padId: string, patch: PadSlotPatch) => void;
  previewRange: (padId: string, startPct: number, endPct: number) => void;
  chopToBank: (padId: string, bank: BankId, count: number) => Promise<string[]>;
  copyPad: (sourceId: string, destinationId: string) => Promise<void>;
  deletePads: (padIds: string[]) => Promise<void>;
  triggerPad: (padId: string, onTriggered?: (time: number) => void) => () => void;
  preparePads: (padIds: string[]) => Promise<void>;
  getPadSettings: (padId: string) => PadSlot | undefined;
  stopAll: () => void;
  storageReady: boolean;
  storageStatus: string;
  storageError: boolean;
}

export const formatPadLabel = (padId: string): string =>
  `${padId[0]}${padId.slice(1).padStart(2, '0')}`;

const emptySlot = (id: string): PadSlot => ({
  id, name: 'EMPTY', buffer: null, sampleKey: null, loading: false, startPct: 0, endPct: 100, pitch: 0, playbackMode: 'one-shot',
});

const createSlots = (): Record<string, PadSlot> => {
  const slots: Record<string, PadSlot> = {};
  for (const bank of BANKS) {
    for (let i = 1; i <= PADS_PER_BANK; i++) {
      const id = `${bank}${i}`;
      slots[id] = emptySlot(id);
    }
  }
  return slots;
};

function storedPad(slot: PadSlot): StoredPad {
  if (!slot.sampleKey) throw new Error(`Pad ${slot.id} has no sample.`);
  return {
    id: slot.id, sampleKey: slot.sampleKey, name: slot.name, startPct: slot.startPct,
    endPct: slot.endPct, pitch: slot.pitch, loop: slot.playbackMode === 'loop', playbackMode: slot.playbackMode,
  };
}

export function usePadBank(): PadBankApi {
  const [slots, setSlots] = useState<Record<string, PadSlot>>(createSlots);
  const [activeBank, setActiveBank] = useState<BankId>('A');
  const [selectedPadId, setSelectedPadId] = useState<string>('A1');
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState('RESTORING PADS');
  const [storageError, setStorageError] = useState(false);

  const slotsRef = useRef(slots);
  const loopVoices = useRef(new Map<string, string>());
  const pendingLoads = useRef(new Map<string, Promise<AudioBuffer>>());
  const reservedPads = useRef(new Set<string>());
  const pendingWrites = useRef(0);
  const failedWrite = useRef(false);
  const playbackGeneration = useRef(0);

  const putSlot = useCallback((slot: PadSlot) => {
    slotsRef.current = { ...slotsRef.current, [slot.id]: slot };
    setSlots(slotsRef.current);
  }, []);

  const persist = useCallback((operation: Promise<void>) => {
    pendingWrites.current++;
    if (!failedWrite.current) setStorageStatus('SAVING');
    void operation.catch((error: unknown) => {
      console.error('[usePadBank] Could not save sample:', error);
      failedWrite.current = true;
      setStorageError(true);
      setStorageStatus('SAVE FAILED — CHANGES MAY BE LOST');
    }).finally(() => {
      pendingWrites.current--;
      if (pendingWrites.current === 0 && !failedWrite.current) setStorageStatus('SAVED LOCALLY');
    });
  }, []);

  useEffect(() => {
    let active = true;
    void readStoredPads().then((saved) => {
      if (!active) return;
      const restored = { ...slotsRef.current };
      for (const pad of saved) {
        if (pad.startPct < 0 || pad.endPct > 100 || pad.startPct >= pad.endPct) {
          throw new Error(`Saved slice for ${pad.id} is invalid.`);
        }
        restored[pad.id] = {
          ...restored[pad.id], ...pad, playbackMode: pad.playbackMode ?? (pad.loop ? 'loop' : 'one-shot'), buffer: null, loading: false,
        };
      }
      slotsRef.current = restored;
      setSlots(restored);
      setStorageStatus('LOCAL STORAGE READY');
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('[usePadBank] Could not restore samples:', error);
      failedWrite.current = true;
      setStorageError(true);
      setStorageStatus('STORAGE UNAVAILABLE — CHANGES MAY BE LOST');
    }).finally(() => {
      if (active) setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

  const stopLoop = useCallback((padId: string): boolean => {
    const voiceId = loopVoices.current.get(padId);
    if (!voiceId) return false;
    audioEngine.stopVoice(voiceId);
    loopVoices.current.delete(padId);
    return true;
  }, []);

  const updatePad = useCallback((padId: string, patch: PadSlotPatch) => {
    const current = slotsRef.current[padId];
    if (!current) return;
    if (reservedPads.current.has(padId)) {
      setStorageError(true);
      setStorageStatus(`PAD ${padId} IS RESERVED FOR SLICES`);
      return;
    }
    const next = { ...current, ...patch };
    if (next.buffer) {
      const { start, end } = rangeFromPercent(next.startPct, next.endPct, next.buffer.length);
      next.startPct = percentFromFrame(start, next.buffer.length);
      next.endPct = percentFromFrame(end, next.buffer.length);
    }
    putSlot(next);
    if (next.sampleKey) persist(savePadSettings(storedPad(next)));
    if (patch.playbackMode && patch.playbackMode !== current.playbackMode) {
      stopLoop(padId);
    }
  }, [persist, putSlot, stopLoop]);

  const previewRange = useCallback((padId: string, startPct: number, endPct: number) => {
    const current = slotsRef.current[padId];
    if (!current?.buffer || reservedPads.current.has(padId)) return;
    const range = rangeFromPercent(startPct, endPct, current.buffer.length);
    putSlot({
      ...current,
      startPct: percentFromFrame(range.start, current.buffer.length),
      endPct: percentFromFrame(range.end, current.buffer.length),
    });
  }, [putSlot]);

  const loadSample = useCallback((padId: string, buffer: AudioBuffer, name: string, audio: Blob) => {
    const current = slotsRef.current[padId];
    if (!current) return;
    if (reservedPads.current.has(padId)) {
      setStorageError(true);
      setStorageStatus(`PAD ${padId} IS RESERVED FOR SLICES`);
      return;
    }
    stopLoop(padId);
    const sampleKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = { ...current, buffer, name, sampleKey, loading: false, startPct: 0, endPct: 100 };
    audioEngine.setPadBuffer(padId, buffer);
    putSlot(next);
    persist(saveSample(storedPad(next), audio));
  }, [persist, putSlot, stopLoop]);

  const ensureBuffer = useCallback((padId: string, sampleKey: string): Promise<AudioBuffer> => {
    const slot = slotsRef.current[padId];
    putSlot({ ...slot, loading: true });
    let operation = pendingLoads.current.get(sampleKey);
    if (!operation) {
      const shared = Object.values(slotsRef.current).find((item) => item.sampleKey === sampleKey && item.buffer)?.buffer;
      operation = shared ? Promise.resolve(shared) : readStoredAudio(padId, sampleKey)
        .then((blob) => blob.arrayBuffer())
        .then((bytes) => audioEngine.decodeAudioData(bytes));
      pendingLoads.current.set(sampleKey, operation);
      const sharedOperation = operation;
      void operation.finally(() => {
        if (pendingLoads.current.get(sampleKey) === sharedOperation) pendingLoads.current.delete(sampleKey);
      }).catch(() => undefined);
    }
    return operation
      .then((buffer) => {
        const current = slotsRef.current[padId];
        if (current.sampleKey !== sampleKey) throw new Error(`Sample on ${padId} changed while loading.`);
        audioEngine.setPadBuffer(padId, buffer);
        putSlot({ ...current, buffer, loading: false });
        return buffer;
      }).catch((error: unknown) => {
        const current = slotsRef.current[padId];
        if (current.sampleKey === sampleKey) putSlot({ ...current, loading: false });
        throw error;
      });
  }, [putSlot]);

  const chopToBank = useCallback(async (padId: string, bank: BankId, count: number): Promise<string[]> => {
    if (!storageReady || failedWrite.current) throw new Error('Sample storage is unavailable or has unsaved changes.');
    const source = slotsRef.current[padId];
    if (!source?.sampleKey) throw new Error('Select a pad with a sample first.');
    if (!BANKS.includes(bank)) throw new Error('Choose a valid destination bank.');
    const sampleKey = source.sampleKey;
    const buffer = source.buffer ?? await ensureBuffer(padId, sampleKey);
    const current = slotsRef.current[padId];
    if (current.sampleKey !== sampleKey) throw new Error('Source sample changed. Try again.');
    const ranges = gridSliceRanges(current.startPct, current.endPct, buffer.length, count);
    const bankIndex = BANKS.indexOf(bank);
    const destinationBanks = count > 16
      ? Array.from({ length: BANKS.length }, (_, index) => BANKS[(bankIndex + index) % BANKS.length])
      : [bank];
    const ids = destinationBanks.flatMap((destination) => Array.from({ length: PADS_PER_BANK }, (_, index) => `${destination}${index + 1}`))
      .filter((id) => !slotsRef.current[id].sampleKey && !reservedPads.current.has(id));
    if (ids.length < count) throw new Error(`${count} empty pads needed; ${ids.length} available${count <= 16 ? ` in bank ${bank}` : ''}.`);
    const destinations = ids.slice(0, count);
    destinations.forEach((id) => reservedPads.current.add(id));
    const slices = destinations.map((id, index): PadSlot => ({
      ...slotsRef.current[id], ...ranges[index], name: `${current.name} ${index + 1}/${count}`,
      buffer, sampleKey, loading: false, pitch: current.pitch, playbackMode: current.playbackMode,
    }));
    pendingWrites.current++;
    setStorageStatus('SAVING');
    try {
      await saveSlices(padId, sampleKey, slices.map(storedPad));
      const next = { ...slotsRef.current };
      for (const slice of slices) {
        next[slice.id] = slice;
        audioEngine.setPadBuffer(slice.id, buffer);
      }
      slotsRef.current = next;
      setSlots(next);
      if (!failedWrite.current) {
        setStorageError(false);
        setStorageStatus(pendingWrites.current > 1 ? 'SAVING' : 'SLICES SAVED LOCALLY');
      }
      return destinations;
    } catch (error) {
      if (!failedWrite.current) {
        setStorageError(true);
        setStorageStatus('SLICE ASSIGNMENT FAILED — NO PADS CHANGED');
      }
      throw error;
    } finally {
      pendingWrites.current--;
      destinations.forEach((id) => reservedPads.current.delete(id));
    }
  }, [ensureBuffer, storageReady]);

  const copyPad = useCallback(async (sourceId: string, destinationId: string): Promise<void> => {
    if (!storageReady || failedWrite.current) throw new Error('Sample storage is unavailable or has unsaved changes.');
    const source = slotsRef.current[sourceId];
    const destination = slotsRef.current[destinationId];
    if (!source?.sampleKey) throw new Error('Source pad is empty.');
    if (!destination || destination.sampleKey || reservedPads.current.has(destinationId)) throw new Error('Destination pad is occupied or busy.');
    const sampleKey = source.sampleKey;
    reservedPads.current.add(destinationId);
    pendingWrites.current++;
    setStorageStatus('SAVING');
    try {
      const buffer = source.buffer ?? await ensureBuffer(sourceId, sampleKey);
      const current = slotsRef.current[sourceId];
      if (current.sampleKey !== sampleKey) throw new Error('Source sample changed.');
      const copy: PadSlot = { ...current, id: destinationId, buffer, loading: false };
      await saveSlices(sourceId, sampleKey, [storedPad(copy)]);
      audioEngine.setPadBuffer(destinationId, buffer);
      putSlot(copy);
      if (!failedWrite.current) {
        setStorageError(false);
        setStorageStatus(pendingWrites.current > 1 ? 'SAVING' : 'PAD COPIED');
      }
    } catch (error) {
      console.error('[usePadBank] Could not copy pad:', error);
      if (!failedWrite.current) {
        setStorageError(true);
        setStorageStatus('PAD COPY FAILED');
      }
      throw error;
    } finally {
      pendingWrites.current--;
      reservedPads.current.delete(destinationId);
    }
  }, [ensureBuffer, putSlot, storageReady]);

  const removePads = useCallback(async (padIds: string[]) => {
    if (!storageReady || failedWrite.current) throw new Error('Sample storage is unavailable or has unsaved changes.');
    if (!padIds.length || new Set(padIds).size !== padIds.length) throw new Error('Choose pads to delete.');
    const expected = padIds.map((id) => {
      const slot = slotsRef.current[id];
      if (!slot?.sampleKey || reservedPads.current.has(id)) throw new Error(`Pad ${id} is empty or busy.`);
      return { id, sampleKey: slot.sampleKey };
    });
    for (const { id } of expected) reservedPads.current.add(id);
    pendingWrites.current++;
    setStorageStatus('DELETING');
    try {
      await deletePads(expected);
      const next = { ...slotsRef.current };
      for (const { id } of expected) {
        audioEngine.stopVoice(id);
        loopVoices.current.delete(id);
        audioEngine.clearPadBuffer(id);
        next[id] = emptySlot(id);
      }
      slotsRef.current = next;
      setSlots(next);
      if (!failedWrite.current) {
        setStorageError(false);
        setStorageStatus(pendingWrites.current > 1 ? 'SAVING' : 'PADS DELETED');
      }
    } catch (error) {
      console.error('[usePadBank] Could not delete pads:', error);
      setStorageError(true);
      setStorageStatus('DELETE FAILED — NO PADS CHANGED');
      throw error;
    } finally {
      pendingWrites.current--;
      for (const { id } of expected) reservedPads.current.delete(id);
    }
  }, [storageReady]);

  const triggerPad = useCallback((padId: string, onTriggered?: (time: number) => void) => {
    setSelectedPadId(padId);
    const noop = () => {};
    if (!storageReady) return noop;
    const slot = slotsRef.current[padId];
    const sampleKey = slot?.sampleKey;
    if (!sampleKey || reservedPads.current.has(padId)) return noop;
    const mode = slot.playbackMode;
    if (mode === 'loop' && stopLoop(padId)) return noop;
    const generation = playbackGeneration.current;
    let released = false;
    let gateVoice: string | null = null;

    void audioEngine.initialize().then(() => {
      if (generation !== playbackGeneration.current || reservedPads.current.has(padId) || (mode === 'gate' && released) ||
          slotsRef.current[padId].sampleKey !== sampleKey) return null;
      return slot.buffer ?? ensureBuffer(padId, sampleKey);
    }).then((buffer) => {
      const current = slotsRef.current[padId];
      if (!buffer || generation !== playbackGeneration.current || reservedPads.current.has(padId) || (mode === 'gate' && released) ||
          current.sampleKey !== sampleKey || current.playbackMode !== mode) return;
      if (mode === 'loop' && stopLoop(padId)) return;
      const { start, end } = rangeFromPercent(current.startPct, current.endPct, buffer.length);
      const voiceId = audioEngine.triggerPad(padId, {
        sliceStart: start / buffer.sampleRate,
        sliceEnd: end / buffer.sampleRate,
        semitoneOffset: current.pitch,
        loop: mode === 'loop',
      });
      if (voiceId && onTriggered) {
        const context = audioEngine.getContext();
        if (context) onTriggered(context.currentTime);
      }
      if (mode === 'loop' && voiceId) loopVoices.current.set(padId, voiceId);
      if (mode === 'gate') gateVoice = voiceId;
    }).catch((error: unknown) => {
      if (slotsRef.current[padId]?.sampleKey !== sampleKey) return;
      console.error('[usePadBank] Could not play pad:', error);
      setStorageError(true);
      if (!failedWrite.current) setStorageStatus(`COULD NOT PLAY ${padId} — CHECK SAMPLE`);
    });
    return () => {
      released = true;
      if (gateVoice) {
        audioEngine.stopVoice(gateVoice);
        gateVoice = null;
      }
    };
  }, [ensureBuffer, stopLoop, storageReady]);

  const preparePads = useCallback(async (padIds: string[]) => {
    if (!storageReady) throw new Error('Pads are still restoring.');
    for (const id of new Set(padIds)) {
      const slot = slotsRef.current[id];
      if (!slot?.sampleKey) throw new Error(`Phrase references empty pad ${id}.`);
      if (!slot.buffer) await ensureBuffer(id, slot.sampleKey);
    }
  }, [ensureBuffer, storageReady]);

  const getPadSettings = useCallback((padId: string) => slotsRef.current[padId], []);

  const stopAll = useCallback(() => {
    playbackGeneration.current++;
    loopVoices.current.clear();
    audioEngine.stopAllVoices();
  }, []);

  useEffect(() => stopAll, [stopAll]);

  return {
    slots,
    activeBank,
    selectedPadId,
    selectedPad: slots[selectedPadId],
    setActiveBank,
    selectPad: setSelectedPadId,
    loadSample,
    updatePad,
    previewRange,
    chopToBank,
    copyPad,
    deletePads: removePads,
    triggerPad,
    preparePads,
    getPadSettings,
    stopAll,
    storageReady,
    storageStatus,
    storageError,
  };
}

export interface EngineStatus {
  state: AudioContextState | 'interrupted' | 'idle';
  voices: number;
}

/** Polls engine telemetry so the footer can show live voice counts while testing polyphony. */
export function useEngineStatus(intervalMs = 100): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>({ state: 'idle', voices: 0 });
  useEffect(() => {
    const id = window.setInterval(() => {
      const state = audioEngine.getContext()?.state ?? 'idle';
      const voices = audioEngine.getActiveVoiceCount();
      setStatus((prev) => (prev.state === state && prev.voices === voices ? prev : { state, voices }));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return status;
}
