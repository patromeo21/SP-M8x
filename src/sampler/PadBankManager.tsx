/**
 * SP-M8x Hybrid Music Production Suite
 * PadBankManager.tsx — 4x4 live pad grid for the active bank (A-D)
 */

import React, { useEffect, useRef, useState } from 'react';
import { PADS_PER_BANK, formatPadLabel, type PadBankApi } from './usePadBank';

export type PadBankManagerProps = Pick<
  PadBankApi,
  'slots' | 'activeBank' | 'selectedPadId' | 'triggerPad'
>;

export const PadBankManager: React.FC<PadBankManagerProps> = ({
  slots,
  activeBank,
  selectedPadId,
  triggerPad,
}) => {
  // Each finger is tracked by pointerId so simultaneous touches light and release independently.
  const activePointers = useRef(new Map<number, { padId: string; release: () => void }>());
  const [pressedPads, setPressedPads] = useState<ReadonlySet<string>>(new Set());

  const syncPressed = () => setPressedPads(new Set(Array.from(activePointers.current.values(), ({ padId }) => padId)));

  useEffect(() => {
    const pointers = activePointers.current;
    setPressedPads(new Set());
    return () => {
      for (const { release } of pointers.values()) release();
      pointers.clear();
    };
  }, [activeBank]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, padId: string) => {
    if (activePointers.current.has(event.pointerId)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointers.current.set(event.pointerId, { padId, release: triggerPad(padId) });
    syncPressed();
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = activePointers.current.get(event.pointerId);
    if (!active) return;
    active.release();
    activePointers.current.delete(event.pointerId);
    syncPressed();
  };

  return (
    <div className="grid grid-cols-4 gap-1.5 flex-1">
      {Array.from({ length: PADS_PER_BANK }, (_, i) => {
        const padId = `${activeBank}${i + 1}`;
        const slot = slots[padId];
        const hasSample = slot.sampleKey !== null;
        const isSelected = padId === selectedPadId;
        const isPressed = pressedPads.has(padId);

        return (
          <button
            key={padId}
            type="button"
            onPointerDown={(event) => handlePointerDown(event, padId)}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={handlePointerEnd}
            onContextMenu={(event) => event.preventDefault()}
            className={`pad-trigger touch-none select-none min-h-[44px] border rounded p-1.5 flex flex-col justify-between text-left text-[9px] transition-all duration-75 ${
              isPressed
                ? 'bg-[var(--accent-phrase)] border-[var(--accent-phrase)] text-zinc-950 scale-95 shadow-[0_0_12px_rgba(34,211,238,0.7)]'
                : isSelected
                ? 'bg-zinc-900 border-[var(--accent-phrase)] shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                : 'bg-zinc-950 border-zinc-800 hover:border-cyan-500/50'
            }`}
          >
            <span className="flex w-full items-center justify-between font-bold">
              <span className={isPressed ? 'text-zinc-900' : 'text-zinc-500'}>{formatPadLabel(padId)}</span>
              {hasSample && (
                <span className={`text-[8px] ${isPressed ? 'text-zinc-900' : 'text-[var(--accent-phrase)]'}`}>
                  {slot.playbackMode === 'one-shot' ? 'ONE' : slot.playbackMode.toUpperCase()}
                </span>
              )}
            </span>
            <span
              className={`text-[8px] truncate max-w-full ${
                isPressed ? 'text-zinc-900' : hasSample ? 'text-zinc-200' : 'text-zinc-600'
              }`}
            >
              {slot.loading ? 'LOADING...' : slot.name}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default PadBankManager;
