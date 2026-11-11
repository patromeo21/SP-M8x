/**
 * SP-M8x Hybrid Music Production Suite
 * PadBankManager.tsx — 4x4 Pad Bank Manager (Banks A-D) with Global State Sync
 */

import React, { useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { projectController, BankId } from '../project/projectController';
import { AudioSampleDropzone } from '../components/AudioSampleDropzone';

export interface PadRuntimeState {
  buffer: AudioBuffer | null;
}

const BANKS: BankId[] = ['A', 'B', 'C', 'D'];

export const PadBankManager: React.FC = () => {
  const [activeBank, setActiveBank] = useState<BankId>('A');
  const [selectedPadId, setSelectedPadId] = useState<string>('A1');

  // Local runtime storage for decoded AudioBuffers (buffers cannot be serialized into projectState JSON)
  const [padBuffers, setPadBuffers] = useState<Record<string, AudioBuffer>>({});

  const projectState = projectController.getState();
  const samplerPads = projectState.sampler.pads;

  const handleSampleLoaded = (padId: string, buffer: AudioBuffer, fileName: string) => {
    // Store decoded audio buffer locally for playback
    setPadBuffers((prev) => ({
      ...prev,
      [padId]: buffer,
    }));

    // Update global project metadata
    projectController.updatePadMetadata(padId, {
      name: fileName,
      fileName,
    });

    console.log(`[PadBankManager] Mapped sample "${fileName}" to Pad ${padId}`);
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

  const togglePolyphonic = (padId: string) => {
    const currentPad = samplerPads[padId];
    if (currentPad) {
      projectController.updatePadMetadata(padId, {
        isPolyphonic: !currentPad.isPolyphonic,
      });
    }
  };

  const activePadsList = Array.from({ length: 16 }, (_, i) => {
    const padNumber = i + 1;
    const padId = `${activeBank}${padNumber}`;
    return {
      metadata: samplerPads[padId],
      hasBuffer: !!padBuffers[padId],
    };
  });

  const selectedPadMeta = samplerPads[selectedPadId];
  const isSelectedPoly = selectedPadMeta ? selectedPadMeta.isPolyphonic : true;

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl font-mono select-none">
      {/* Top Controls: Bank Selector & Pad Inspector */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        {/* Bank Tabs */}
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

        {/* Selected Pad Info & Mode Toggle */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-400">
            SEL: <strong className="text-cyan-400">{selectedPadId}</strong>
          </span>
          <button
            type="button"
            onPointerDown={() => togglePolyphonic(selectedPadId)}
            className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
              isSelectedPoly
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : 'bg-amber-950 text-amber-400 border border-amber-800'
            }`}
          >
            {isSelectedPoly ? 'POLY' : 'MONO'}
          </button>
        </div>
      </div>

      {/* 4x4 Interactive Pad Grid */}
      <div className="grid grid-cols-4 gap-2">
        {activePadsList.map(({ metadata, hasBuffer }, index) => {
          const padNumber = index + 1;
          const padId = `${activeBank}${padNumber}`;
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
                {metadata ? metadata.name : `EMPTY ${padId}`}
              </span>
              <span className="text-[9px] text-zinc-500">
                {metadata && metadata.isPolyphonic ? 'POLY' : 'MONO'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Pad Sample Uploader */}
      <div className="mt-2 pt-3 border-t border-zinc-800/80">
        <AudioSampleDropzone padId={selectedPadId} onSampleLoaded={handleSampleLoaded} />
      </div>
    </div>
  );
};

export default PadBankManager;