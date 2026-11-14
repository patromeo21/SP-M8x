/**
 * SP-M8x Hybrid Music Production Suite
 * PadBankManager.tsx — 4x4 live pad grid for the active bank (A-D)
 */

import React, { useEffect, useRef, useState } from 'react';
import { PADS_PER_BANK, formatPadLabel, type PadBankApi } from './usePadBank';

export type PadBankManagerProps = Pick<
  PadBankApi,
  'slots' | 'activeBank' | 'selectedPadId' | 'triggerPad' | 'deletePads' | 'copyPad' | 'storageReady'
>;

export const PadBankManager: React.FC<PadBankManagerProps> = ({
  slots,
  activeBank,
  selectedPadId,
  triggerPad,
  deletePads,
  copyPad,
  storageReady,
}) => {
  // Each finger is tracked by pointerId so simultaneous touches light and release independently.
  const activePointers = useRef(new Map<number, { padId: string; release: () => void }>());
  const gridRef = useRef<HTMLDivElement>(null);
  const copyingPointer = useRef<{ pointerId: number; source: string } | null>(null);
  const [pressedPads, setPressedPads] = useState<ReadonlySet<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const syncPressed = () => setPressedPads(new Set(Array.from(activePointers.current.values(), ({ padId }) => padId)));

  useEffect(() => {
    const pointers = activePointers.current;
    setPressedPads(new Set());
    return () => {
      copyingPointer.current = null;
      for (const { release } of pointers.values()) release();
      pointers.clear();
    };
  }, [activeBank]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const preventDrag = (event: Event) => { if (event.cancelable) event.preventDefault(); };
    grid.addEventListener('touchmove', preventDrag, { passive: false });
    grid.addEventListener('dragstart', preventDrag);
    grid.addEventListener('selectstart', preventDrag);
    return () => {
      grid.removeEventListener('touchmove', preventDrag);
      grid.removeEventListener('dragstart', preventDrag);
      grid.removeEventListener('selectstart', preventDrag);
    };
  }, []);

  const toggleSelection = (padId: string) => {
    if (!slots[padId].sampleKey || deleting || confirming) return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(padId)) next.delete(padId); else next.add(padId);
      return next;
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, padId: string) => {
    if (activePointers.current.has(event.pointerId)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (copying) {
      if (slots[padId].sampleKey && !copyingPointer.current) copyingPointer.current = { pointerId: event.pointerId, source: padId };
      return;
    }
    if (selecting) {
      toggleSelection(padId);
      return;
    }
    activePointers.current.set(event.pointerId, { padId, release: triggerPad(padId) });
    syncPressed();
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = copyingPointer.current;
    if (drag?.pointerId === event.pointerId) {
      copyingPointer.current = null;
      if (event.type === 'pointerup') {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-pad-id]');
        const destination = target?.dataset.padId;
        if (destination && destination !== drag.source) {
          setCopyError('');
          void copyPad(drag.source, destination).catch((failure: unknown) => {
            setCopyError(failure instanceof Error ? failure.message : 'Could not copy pad.');
          });
        }
      }
      return;
    }
    const active = activePointers.current.get(event.pointerId);
    if (!active) return;
    active.release();
    activePointers.current.delete(event.pointerId);
    syncPressed();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      <div className="flex items-center justify-between gap-1 text-[9px]">
        <button type="button" disabled={!storageReady || deleting} onClick={() => {
          setSelecting(!selecting); setCopying(false); setCopyError(''); setSelected(new Set()); setConfirming(false); setError('');
        }} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-300 disabled:opacity-40">
          {selecting ? 'CANCEL' : 'DEL'}
        </button>
        {!selecting && <button type="button" disabled={!storageReady} aria-pressed={copying} onClick={() => {
          setCopying(!copying); setCopyError('');
        }} className={`rounded border px-2 py-1 disabled:opacity-40 ${copying ? 'border-cyan-600 text-cyan-300' : 'border-zinc-700 text-zinc-300'}`}>
          {copying ? 'COPY ON' : 'COPY'}
        </button>}
        {selecting && <button type="button" disabled={!selected.size || deleting} onClick={() => setConfirming(true)}
          className="rounded border border-rose-800 bg-rose-950 px-2 py-1 text-rose-300 disabled:opacity-40">
          DELETE {selected.size}
        </button>}
      </div>
      {copying && <div role={copyError ? 'alert' : 'status'} className={`text-[9px] ${copyError ? 'text-rose-300' : 'text-zinc-400'}`}>
        {copyError || 'DRAG A LOADED PAD TO AN EMPTY PAD'}
      </div>}
      {confirming && <div role="dialog" aria-label="Confirm pad deletion" className="pad-delete-dialog">
        <div className="pad-delete-dialog-panel">
          <strong>DELETE {selected.size} PAD{selected.size === 1 ? '' : 'S'}?</strong>
          <span>{Array.from(selected).map(formatPadLabel).join(', ')}</span>
          <span>This cannot be undone.</span>
          {error && <span role="alert" className="text-rose-300">{error}</span>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={deleting} onClick={() => { setConfirming(false); setError(''); }}
              className="rounded border border-zinc-700 px-3 py-2">CANCEL</button>
            <button type="button" disabled={deleting} onClick={() => {
              setDeleting(true); setError('');
              void deletePads(Array.from(selected)).then(() => {
                setSelected(new Set()); setConfirming(false); setSelecting(false);
              }).catch((failure: unknown) => {
                setError(failure instanceof Error ? failure.message : 'Could not delete pads.');
              }).finally(() => setDeleting(false));
            }} className="rounded border border-rose-700 bg-rose-950 px-3 py-2 text-rose-200">
              {deleting ? 'DELETING' : 'CONFIRM DELETE'}
            </button>
          </div>
        </div>
      </div>}
      <div ref={gridRef} className="pad-grid grid grid-cols-4 gap-1.5 flex-1 min-h-0">
      {Array.from({ length: PADS_PER_BANK }, (_, i) => {
        const padId = `${activeBank}${i + 1}`;
        const slot = slots[padId];
        const hasSample = slot.sampleKey !== null;
        const isSelected = selecting ? selected.has(padId) : padId === selectedPadId;
        const isPressed = pressedPads.has(padId);

        return (
          <button
            key={padId}
            data-pad-id={padId}
            type="button"
            aria-pressed={selecting ? isSelected : undefined}
            onClick={(event) => {
              if (selecting && event.detail === 0) toggleSelection(padId);
            }}
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
                  {selecting && isSelected ? 'SELECTED' : slot.playbackMode === 'one-shot' ? 'ONE' : slot.playbackMode.toUpperCase()}
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
    </div>
  );
};

export default PadBankManager;
