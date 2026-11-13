/**
 * SP-M8x Hybrid Music Production Suite
 * usePadBank.ts — Shared pad state (banks A-D) bridging the UI to the single audio engine
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import type { BankId } from '../project/projectController';

export const BANKS: readonly BankId[] = ['A', 'B', 'C', 'D'];
export const PADS_PER_BANK = 16;

export interface PadSlot {
  id: string; // canonical pad id, e.g. "A1" .. "D16"
  name: string;
  buffer: AudioBuffer | null;
  startPct: number; // 0-100
  endPct: number; // 0-100
  pitch: number; // semitones
  loop: boolean;
}

export type PadSlotPatch = Partial<Omit<PadSlot, 'id'>>;

export interface PadBankApi {
  slots: Record<string, PadSlot>;
  activeBank: BankId;
  selectedPadId: string;
  selectedPad: PadSlot;
  setActiveBank: (bank: BankId) => void;
  selectPad: (padId: string) => void;
  loadSample: (padId: string, buffer: AudioBuffer, name: string) => void;
  updatePad: (padId: string, patch: PadSlotPatch) => void;
  triggerPad: (padId: string) => void;
  stopAll: () => void;
}

export const formatPadLabel = (padId: string): string =>
  `${padId[0]}${padId.slice(1).padStart(2, '0')}`;

const createSlots = (): Record<string, PadSlot> => {
  const slots: Record<string, PadSlot> = {};
  for (const bank of BANKS) {
    for (let i = 1; i <= PADS_PER_BANK; i++) {
      const id = `${bank}${i}`;
      slots[id] = { id, name: 'EMPTY', buffer: null, startPct: 0, endPct: 100, pitch: 0, loop: false };
    }
  }
  return slots;
};

export function usePadBank(): PadBankApi {
  const [slots, setSlots] = useState<Record<string, PadSlot>>(createSlots);
  const [activeBank, setActiveBank] = useState<BankId>('A');
  const [selectedPadId, setSelectedPadId] = useState<string>('A1');

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const loopVoices = useRef(new Map<string, string>());

  const stopLoop = useCallback((padId: string): boolean => {
    const voiceId = loopVoices.current.get(padId);
    if (!voiceId) return false;
    audioEngine.stopVoice(voiceId);
    loopVoices.current.delete(padId);
    return true;
  }, []);

  const updatePad = useCallback((padId: string, patch: PadSlotPatch) => {
    setSlots((prev) => {
      const current = prev[padId];
      if (!current) return prev;
      const next = { ...current, ...patch };
      next.startPct = Math.max(0, Math.min(next.startPct, 99));
      next.endPct = Math.max(next.startPct + 1, Math.min(next.endPct, 100));
      return { ...prev, [padId]: next };
    });
    if (patch.loop === false) stopLoop(padId);
  }, [stopLoop]);

  const loadSample = useCallback((padId: string, buffer: AudioBuffer, name: string) => {
    stopLoop(padId);
    audioEngine.setPadBuffer(padId, buffer);
    updatePad(padId, { buffer, name, startPct: 0, endPct: 100 });
  }, [stopLoop, updatePad]);

  const triggerPad = useCallback((padId: string) => {
    setSelectedPadId(padId);
    const slot = slotsRef.current[padId];
    if (!slot?.buffer) return;
    if (slot.loop && stopLoop(padId)) return;

    // initialize() is invoked synchronously inside the gesture so iOS Safari allows resume().
    void audioEngine.initialize().then(() => {
      const duration = slot.buffer?.duration ?? 0;
      const voiceId = audioEngine.triggerPad(padId, {
        sliceStart: (slot.startPct / 100) * duration,
        sliceEnd: (slot.endPct / 100) * duration,
        semitoneOffset: slot.pitch,
        loop: slot.loop,
      });
      if (slot.loop && voiceId) loopVoices.current.set(padId, voiceId);
    }).catch((error: unknown) => {
      console.error('[usePadBank] Could not start audio:', error);
    });
  }, [stopLoop]);

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
