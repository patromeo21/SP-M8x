/**
 * SP-M8x Hybrid Music Production Suite
 * PadBankManager.tsx — 4x4 Pad Bank Manager (Banks A-D)
 */

import React, { useState, useEffect } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { projectController } from '../project/projectController';
import { BankId, PadAssignment } from '../project/projectTypes';
import { AudioSampleDropzone } from '../components/AudioSampleDropzone';

const BANKS: BankId[] = ['A', 'B', 'C', 'D'];

export const PadBankManager: React.FC = () => {
  const [projectState, setProjectState] = useState(() => projectController.getState());
  const [activeBank, setActiveBank] = useState<BankId>('A');
  const [selectedPadId, setSelectedPadId] = useState<string>('A1');
  const [padBuffers, setPadBuffers] = useState<Record<string, AudioBuffer>>({});

  useEffect(() => {
    const unsubscribe = projectController.subscribe((newState) => {
      setProjectState(newState);
    });
    return () => unsubscribe();
  }, []);

  // Safely extract sampler assignments from project state without strict interface collisions
  const stateRecord = projectState as unknown as Record<string, any>;
  const assignments: PadAssignment[] = stateRecord.sampler?.assignments || [];

  const parsePadId = (padId: string): { bank: BankId; slot: number } => {
    const bank = padId[0] as BankId;
    const slot = parseInt(padId.slice(1), 10) - 1;
    return { bank, slot };
  };

  const getAssignment = (bank: BankId, slot: number): PadAssignment | undefined => {
    return assignments.find((a: PadAssignment) => a.bank === bank && a.slot === slot);
  };

  const { bank: selBank, slot: selSlot } = parsePadId(selectedPadId);
  const selectedAssignment = getAssignment(selBank, selSlot);

  const handleSampleLoaded = (padId: string, buffer: AudioBuffer, fileName: string) => {
    setPadBuffers((prev) => ({
      ...prev,
      [padId]: buffer,
    }));
    console.log(`[PadBankManager] Loaded "${fileName}" into Pad ${padId}`);
  };

  const handleTriggerPad = (padId: string) => {
    setSelectedPadId(padId);
    const buffer = padBuffers[padId];

    if (buffer) {
      audioEngine.triggerVoice(padId, buffer);
    } else {
      console.log(`[PadBankManager] Pad ${padId} has no audio buffer loaded.`);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl font-mono select-none">
      {/* Bank Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-1">
          {BANKS.map((bank) => (
            <button
              key={bank}
              type="button"
              onPointerDown={() => setActiveBank(bank)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all active:scale-95 ${
                activeBank === bank
                  ? 'bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-500/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              BANK {bank}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-400">
            SEL: <strong className="text-cyan-400">{selectedPadId}</strong>
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-cyan-300">
            {selectedAssignment?.loop ? 'LOOP' : 'ONESHOT'}
          </span>
        </div>
      </div>

      {/* 4x4 Grid for Active Bank */}
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 16 }, (_, slotIndex) => {
          const padId = `${activeBank}${slotIndex + 1}`;
          const assignment = getAssignment(activeBank, slotIndex);
          const hasBuffer = !!padBuffers[padId];
          const isSelected = padId === selectedPadId;

          return (
            <button
              key={padId}
              type="button"
              onPointerDown={() => handleTriggerPad(padId)}
              className={`h-20 flex flex-col items-center justify-between p-2 rounded-xl border transition-all active:scale-95 touch-none ${
                isSelected ? 'border-cyan-400 shadow-md shadow-cyan-500/10' : 'border-zinc-800'
              } ${
                hasBuffer
                  ? 'bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700'
                  : 'bg-zinc-950/60 text-zinc-600 hover:bg-zinc-900'
              }`}
            >
              <div className="w-full flex justify-between text-[10px] font-bold">
                <span className={hasBuffer ? 'text-cyan-400' : 'text-zinc-600'}>{padId}</span>
                {hasBuffer && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </div>
              <span className="text-[10px] font-medium truncate max-w-full px-1">
                {assignment?.name || `EMPTY ${padId}`}
              </span>
              <span className="text-[9px] text-zinc-500">
                {assignment?.loop ? 'LOOP' : 'ONE'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sample Dropzone */}
      <div className="mt-2 pt-3 border-t border-zinc-800/80">
        <AudioSampleDropzone padId={selectedPadId} onSampleLoaded={handleSampleLoaded} />
      </div>
    </div>
  );
};

export default PadBankManager;