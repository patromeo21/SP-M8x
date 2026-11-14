/**
 * SP-M8x Hybrid Music Production Suite
 * usePadBank.ts — Shared pad state (banks A-D) bridging the UI to the single audio engine
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import type { BankId } from '../project/projectController';
import { readStoredAudio, readStoredPads, savePadSettings, saveSample, type StoredPad } from './padStorage';

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
  loop: boolean;
}

export type PadSlotPatch = Partial<Pick<PadSlot, 'startPct' | 'endPct' | 'pitch' | 'loop'>>;

export interface PadBankApi {
  slots: Record<string, PadSlot>;
  activeBank: BankId;
  selectedPadId: string;
  selectedPad: PadSlot;
  setActiveBank: (bank: BankId) => void;
  selectPad: (padId: string) => void;
  loadSample: (padId: string, buffer: AudioBuffer, name: string, audio: Blob) => void;
  updatePad: (padId: string, patch: PadSlotPatch) => void;
  triggerPad: (padId: string) => void;
  stopAll: () => void;
  storageReady: boolean;
  storageStatus: string;
  storageError: boolean;
}

export const formatPadLabel = (padId: string): string =>
  `${padId[0]}${padId.slice(1).padStart(2, '0')}`;

const createSlots = (): Record<string, PadSlot> => {
  const slots: Record<string, PadSlot> = {};
  for (const bank of BANKS) {
    for (let i = 1; i <= PADS_PER_BANK; i++) {
      const id = `${bank}${i}`;
      slots[id] = { id, name: 'EMPTY', buffer: null, sampleKey: null, loading: false, startPct: 0, endPct: 100, pitch: 0, loop: false };
    }
  }
  return slots;
};

function storedPad(slot: PadSlot): StoredPad {
  if (!slot.sampleKey) throw new Error(`Pad ${slot.id} has no sample.`);
  return {
    id: slot.id, sampleKey: slot.sampleKey, name: slot.name, startPct: slot.startPct,
    endPct: slot.endPct, pitch: slot.pitch, loop: slot.loop,
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
  const pendingWrites = useRef(0);
  const failedWrite = useRef(false);

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
        const startPct = Math.max(0, Math.min(99, pad.startPct));
        restored[pad.id] = {
          ...restored[pad.id], ...pad, buffer: null, loading: false, startPct,
          endPct: Math.max(startPct + 1, Math.min(100, pad.endPct)),
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
    const next = { ...current, ...patch };
    next.startPct = Math.max(0, Math.min(next.startPct, 99));
    next.endPct = Math.max(next.startPct + 1, Math.min(next.endPct, 100));
    putSlot(next);
    if (next.sampleKey) persist(savePadSettings(storedPad(next)));
    if (patch.loop === false) stopLoop(padId);
  }, [persist, putSlot, stopLoop]);

  const loadSample = useCallback((padId: string, buffer: AudioBuffer, name: string, audio: Blob) => {
    const current = slotsRef.current[padId];
    if (!current) return;
    stopLoop(padId);
    const sampleKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = { ...current, buffer, name, sampleKey, loading: false, startPct: 0, endPct: 100 };
    audioEngine.setPadBuffer(padId, buffer);
    putSlot(next);
    persist(saveSample(storedPad(next), audio));
  }, [persist, putSlot, stopLoop]);

  const ensureBuffer = useCallback((padId: string, sampleKey: string): Promise<AudioBuffer> => {
    const existing = pendingLoads.current.get(sampleKey);
    if (existing) return existing;
    const slot = slotsRef.current[padId];
    putSlot({ ...slot, loading: true });
    const operation = readStoredAudio(padId, sampleKey)
      .then((blob) => blob.arrayBuffer())
      .then((bytes) => audioEngine.decodeAudioData(bytes))
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
      }).finally(() => { pendingLoads.current.delete(sampleKey); });
    pendingLoads.current.set(sampleKey, operation);
    return operation;
  }, [putSlot]);

  const triggerPad = useCallback((padId: string) => {
    setSelectedPadId(padId);
    if (!storageReady) return;
    const slot = slotsRef.current[padId];
    const sampleKey = slot?.sampleKey;
    if (!sampleKey) return;
    if (slot.loop && stopLoop(padId)) return;

    void audioEngine.initialize().then(() => {
      if (slotsRef.current[padId].sampleKey !== sampleKey) return null;
      return slot.buffer ?? ensureBuffer(padId, sampleKey);
    }).then((buffer) => {
      const current = slotsRef.current[padId];
      if (!buffer || current.sampleKey !== sampleKey) return;
      if (current.loop && stopLoop(padId)) return;
      const duration = buffer.duration;
      const voiceId = audioEngine.triggerPad(padId, {
        sliceStart: (current.startPct / 100) * duration,
        sliceEnd: (current.endPct / 100) * duration,
        semitoneOffset: current.pitch,
        loop: current.loop,
      });
      if (current.loop && voiceId) loopVoices.current.set(padId, voiceId);
    }).catch((error: unknown) => {
      console.error('[usePadBank] Could not play pad:', error);
      setStorageError(true);
      if (!failedWrite.current) setStorageStatus(`COULD NOT PLAY ${padId} — CHECK SAMPLE`);
    });
  }, [ensureBuffer, stopLoop, storageReady]);

  const stopAll = useCallback(() => {
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
    triggerPad,
    stopAll,
    storageReady,
    storageStatus,
    storageError,
  };
}

export interface EngineStatus {
  state: AudioContextState | 'idle';
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
