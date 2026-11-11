/**
 * SP-M8x Hybrid Music Production Suite
 * PadBankManager.tsx — 4x4 Pad Bank Manager with Chromatic & Polyphonic Toggles
 */

import React, { useState } from 'react';
import { projectController } from '../project/projectController';
import type { BankId, PadAssignment } from '../project/projectTypes';

const BANKS: BankId[] = ['A', 'B', 'C', 'D'];

interface PadBankManagerProps {
  onPadTrigger?: (bank: BankId, slot: number) => void;
}

export const PadBankManager: React.FC<PadBankManagerProps> = ({ onPadTrigger }) => {
  const [activeBank, setActiveBank] = useState<BankId>('A');
  const [isChromaticMode, setIsChromaticMode] = useState<boolean>(false);
  const [isPolyphonicMode, setIsPolyphonicMode] = useState<boolean>(true);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(0);

  const projectState = projectController.getState();
  const assignments = projectState.sampler.assignments;

  // Filter assignments for the currently selected bank
  const currentBankAssignments = assignments.filter((a) => a.bank === activeBank);
  const selectedAssignment = currentBankAssignments.find((a) => a.slot === selectedSlot);

  const handlePadClick = (slot: number) => {
    setSelectedSlot(slot);
    onPadTrigger?.(activeBank, slot);
  };

  const handleUpdateAssignment = (updates: Partial<PadAssignment>) => {
    if (selectedSlot === null || !selectedAssignment) return;

    const updatedAssignments = assignments.map((a) => {
      if (a.bank === activeBank && a.slot === selectedSlot) {
        return { ...a, ...updates };
      }
      return a;
    });

    projectController.dispatch({
      type: 'PROJECT_REPLACE',
      project: {
        ...projectState,
        sampler: {
          ...projectState.sampler,
          assignments: updatedAssignments,
        },
      },
    });
  };

  return (
    <div className="flex flex-col bg-zinc-950 text-zinc-100 font-mono rounded-xl border border-zinc-800 p-4 shadow-2xl gap-4">
      {/* Top Bar: Bank Selector & Global Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-3">
        {/* Bank Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          {BANKS.map((bank) => (
            <button
              key={bank}
              onClick={() => setActiveBank(bank)}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeBank === bank
                  ? 'bg-amber-500 text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              BANK {bank}
            </button>
          ))}
        </div>

        {/* Mode Toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsChromaticMode(!isChromaticMode)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-all ${
              isChromaticMode
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
            }`}
          >
            CHROMATIC: {isChromaticMode ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setIsPolyphonicMode(!isPolyphonicMode)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-all ${
              isPolyphonicMode
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
            }`}
          >
            POLY: {isPolyphonicMode ? 'ON' : 'MONO'}
          </button>
        </div>
      </div>

      {/* 4x4 Pad Grid */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 16 }).map((_, slot) => {
          const assignment = currentBankAssignments.find((a) => a.slot === slot);
          const isSelected = selectedSlot === slot;
          const hasSample = Boolean(assignment?.sampleAssetId);

          return (
            <button
              key={slot}
              onClick={() => handlePadClick(slot)}
              className={`flex flex-col justify-between h-24 p-2.5 rounded-xl border text-left transition-all active:scale-95 ${
                isSelected
                  ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30'
                  : hasSample
                  ? 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                  : 'border-zinc-900 bg-zinc-900/40 hover:border-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-bold text-zinc-500">
                  {activeBank}{String(slot + 1).padStart(2, '0')}
                </span>
                {hasSample && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
              </div>
              <div className="truncate text-xs font-bold text-zinc-200">
                {assignment?.name || `Pad ${slot + 1}`}
              </div>
              <div className="text-[10px] text-zinc-500">
                {hasSample ? `Vol: ${Math.round((assignment?.volume ?? 0.8) * 100)}%` : 'EMPTY'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Pad Quick Inspector */}
      {selectedAssignment && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/70 p-3 rounded-xl border border-zinc-800/80 text-xs">
          <div>
            <span className="text-zinc-500">Selected: </span>
            <span className="font-bold text-amber-400">{selectedAssignment.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="text-zinc-400">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selectedAssignment.volume}
                onChange={(e) => handleUpdateAssignment({ volume: parseFloat(e.target.value) })}
                className="w-24 accent-amber-500 cursor-pointer"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-zinc-400">Root Note</span>
              <input
                type="number"
                min="0"
                max="127"
                value={selectedAssignment.chromaticRootNote ?? 60}
                onChange={(e) => handleUpdateAssignment({ chromaticRootNote: parseInt(e.target.value, 10) || 60 })}
                className="w-14 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-center text-zinc-200"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
