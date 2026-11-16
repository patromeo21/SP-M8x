/**
 * SP-M8x Hybrid Music Production Suite
 * usePadBank.ts — Shared pad state (banks A-D) bridging the UI to the single audio engine
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { projectController, type BankId } from '../project/projectController';
import { deletePads, readStoredAudio, readStoredPads, savePadSettings, saveSample, saveSlices, type PlaybackMode, type StoredPad } from './padStorage';
import { percentFromFrame, rangeFromPercent } from './sampleRange';
import { gridSliceMarkers, gridSliceRanges, sliceRange } from './gridSlices';
import type { PadPlayMode } from './chromatic';

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
  sliceMarkers: number[];
}

export type PadSlotPatch = Partial<Pick<PadSlot, 'startPct' | 'endPct' | 'pitch' | 'playbackMode'>>;

export interface PadBankApi {
  slots: Record<string, PadSlot>;
  activeBank: BankId;
  selectedPadId: string;
  selectedPad: PadSlot;
  padPlayMode: PadPlayMode;
  chromaticRootOffset: number;
  setPadPlayMode: (mode: PadPlayMode) => void;
  setChromaticRootOffset: (offset: number) => void;
  setActiveBank: (bank: BankId) => void;
  stopGatedVoices: () => void;
  selectPad: (padId: string) => void;
  loadSample: (padId: string, buffer: AudioBuffer, name: string, audio: Blob) => void;
  updatePad: (padId: string, patch: PadSlotPatch) => void;
  previewRange: (padId: string, startPct: number, endPct: number) => void;
  chopToBank: (padId: string, bank: BankId, count: number) => Promise<string[]>;
  generateSliceMarkers: (padId: string, count: number) => Promise<void>;
  copyPad: (sourceId: string, destinationId: string) => Promise<void>;
  deletePads: (padIds: string[]) => Promise<void>;
  triggerPad: (padId: string, onTriggered?: (time: number) => number | void, semitoneOffset?: number, pointerTime?: number, sliceIndex?: number, playThrough?: boolean) => (pointerTime?: number) => void;
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
  id, name: 'EMPTY', buffer: null, sampleKey: null, loading: false, startPct: 0, endPct: 100, pitch: 0, playbackMode: 'one-shot', sliceMarkers: [],
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
    sliceMarkers: slot.sliceMarkers,
  };
}

export function usePadBank(): PadBankApi {
  const [slots, setSlots] = useState<Record<string, PadSlot>>(createSlots);
  const [activeBank, setActiveBank] = useState<BankId>('A');
  const [selectedPadId, setSelectedPadId] = useState<string>('A1');
  const [padPlayMode, setPadPlayMode] = useState<PadPlayMode>('BANK_64');
  const [chromaticRootOffset, setChromaticRootOffset] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState('RESTORING PADS');
  const [storageError, setStorageError] = useState(false);

  const slotsRef = useRef(slots);
  const loopVoices = useRef(new Map<string, string>());
  const activeGates = useRef(new Set<() => void>());
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

  const stopLoop = useCallback((padId: string, pitch?: number, sliceIndex?: number): boolean => {
    let stopped = false;
    for (const [key, voiceId] of loopVoices.current) {
      if (pitch === undefined ? !key.startsWith(`${padId}:`) : key !== `${padId}:${pitch}:${sliceIndex ?? 0}`) continue;
      audioEngine.stopVoice(voiceId);
      loopVoices.current.delete(key);
      stopped = true;
    }
    return stopped;
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
    const next = { ...current, buffer, name, sampleKey, loading: false, startPct: 0, endPct: 100, sliceMarkers: [] };
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

  const generateSliceMarkers = useCallback(async (padId: string, count: number): Promise<void> => {
    if (!storageReady || failedWrite.current) throw new Error('Sample storage is unavailable or has unsaved changes.');
    const source = slotsRef.current[padId];
    if (!source?.sampleKey || reservedPads.current.has(padId)) throw new Error('Select an available pad with a sample first.');
    const sampleKey = source.sampleKey;
    reservedPads.current.add(padId);
    pendingWrites.current++;
    setStorageStatus('SAVING');
    try {
      const buffer = source.buffer ?? await ensureBuffer(padId, sampleKey);
      const current = slotsRef.current[padId];
      if (current.sampleKey !== sampleKey) throw new Error('Source sample changed. Try again.');
      const next = { ...current, sliceMarkers: gridSliceMarkers(current.startPct, current.endPct, buffer.length, count) };
      await savePadSettings(storedPad(next));
      putSlot(next);
      if (!failedWrite.current) { setStorageError(false); setStorageStatus(pendingWrites.current > 1 ? 'SAVING' : 'SAVED LOCALLY'); }
    } finally {
      pendingWrites.current--;
      reservedPads.current.delete(padId);
    }
  }, [storageReady, ensureBuffer, putSlot]);

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
      buffer, sampleKey, loading: false, pitch: current.pitch, playbackMode: current.playbackMode, sliceMarkers: [],
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
        stopLoop(id);
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
  }, [storageReady, stopLoop]);

  const triggerPad = useCallback((padId: string, onTriggered?: (time: number) => number | void, semitoneOffset = 0, _pointerTime?: number, sliceIndex?: number, playThrough = false) => {
    setSelectedPadId(padId);
    const noop = () => {};
    const audioReady = audioEngine.initialize();
    const reportUnlockFailure = (error: unknown) => console.error('[usePadBank] Could not unlock audio on pad touch:', error);
    if (!storageReady) {
      void audioReady.catch(reportUnlockFailure);
      return noop;
    }
    const slot = slotsRef.current[padId];
    const sampleKey = slot?.sampleKey;
    if (!sampleKey || reservedPads.current.has(padId)) {
      void audioReady.catch(reportUnlockFailure);
      return noop;
    }
    const resolvedSlice = sliceIndex === undefined ? undefined : Math.min(sliceIndex, slot.sliceMarkers.length - 1);
    if (sliceIndex !== undefined && (!Number.isInteger(sliceIndex) || sliceIndex < 1 || !resolvedSlice || resolvedSlice < 1)) {
      void audioReady.catch(reportUnlockFailure);
      setStorageError(true);
      setStorageStatus(`NO SLICE MARKERS FOR ${padId}`);
      return noop;
    }
    const mode = slot.playbackMode;
    if (mode === 'loop' && stopLoop(padId, semitoneOffset, resolvedSlice)) return noop;
    const generation = playbackGeneration.current;
    let released = false;
    let gateVoice: string | null = null;

    void audioReady.then(() => {
      if (generation !== playbackGeneration.current || reservedPads.current.has(padId) || (mode === 'gate' && released) ||
          slotsRef.current[padId].sampleKey !== sampleKey) return null;
      return slot.buffer ?? ensureBuffer(padId, sampleKey);
    }).then((buffer) => {
      const current = slotsRef.current[padId];
      if (!buffer || generation !== playbackGeneration.current || reservedPads.current.has(padId) || (mode === 'gate' && released) ||
          current.sampleKey !== sampleKey || current.playbackMode !== mode) return;
      if (mode === 'loop' && stopLoop(padId, semitoneOffset, resolvedSlice)) return;
      const range = resolvedSlice === undefined ? rangeFromPercent(current.startPct, current.endPct, buffer.length) :
        sliceRange(current.sliceMarkers, resolvedSlice, buffer.length);
      if (!range) throw new Error(`Invalid slice markers for ${padId}.`);
      const { start, end } = range;
      const voiceId = audioEngine.triggerPad(padId, {
        sliceStart: start / buffer.sampleRate,
        sliceEnd: (playThrough && resolvedSlice !== undefined ? buffer.length : end) / buffer.sampleRate,
        semitoneOffset: current.pitch + semitoneOffset,
        loop: mode === 'loop',
        gated: mode === 'gate',
        padVolume: projectController.getState().sampler.pads[padId]?.volume ?? 1,
        chokeGroup: projectController.getState().sampler.pads[padId]?.chokeGroup ?? null,
        trackIndex: projectController.getState().sampler.pads[padId]?.targetTrack ?? 0,
      });
      if (voiceId && onTriggered) {
        const context = audioEngine.getContext();
        if (context) {
          const track = onTriggered(context.currentTime);
          if (track !== undefined) audioEngine.setVoiceTrack(voiceId, track);
        }
      }
      if (mode === 'loop' && voiceId) loopVoices.current.set(`${padId}:${semitoneOffset}:${resolvedSlice ?? 0}`, voiceId);
      if (mode === 'gate') gateVoice = voiceId;
    }).catch((error: unknown) => {
      if (slotsRef.current[padId]?.sampleKey !== sampleKey) return;
      console.error('[usePadBank] Could not play pad:', error);
      setStorageError(true);
      if (!failedWrite.current) setStorageStatus(`COULD NOT PLAY ${padId} — CHECK SAMPLE`);
    });
    const release = () => {
      if (released) return;
      released = true;
      if (gateVoice) {
        audioEngine.releaseGatedVoice(gateVoice, audioEngine.getContext()?.currentTime ?? 0);
        gateVoice = null;
      }
      activeGates.current.delete(release);
    };
    if (mode === 'gate') activeGates.current.add(release);
    return release;
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
    for (const release of [...activeGates.current]) release();
    loopVoices.current.clear();
    audioEngine.stopAllVoices();
  }, []);

  const stopGatedVoices = useCallback(() => {
    for (const release of [...activeGates.current]) release();
    audioEngine.stopGatedVoices();
  }, []);

  useEffect(() => stopAll, [stopAll]);

  return {
    slots,
    activeBank,
    selectedPadId,
    selectedPad: slots[selectedPadId],
    padPlayMode,
    chromaticRootOffset,
    setPadPlayMode,
    setChromaticRootOffset,
    setActiveBank,
    stopGatedVoices,
    selectPad: setSelectedPadId,
    loadSample,
    updatePad,
    previewRange,
    chopToBank,
    generateSliceMarkers,
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
