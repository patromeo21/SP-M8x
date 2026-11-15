/**
 * SP-M8x Hybrid Music Production Suite
 * PadBankManager.tsx — 4x4 live pad grid for the active bank (A-D)
 */

import React, { useEffect, useRef, useState } from 'react';
import { PADS_PER_BANK, formatPadLabel, type PadBankApi } from './usePadBank';
import { chromaticNote, chromaticOffset } from './chromatic';

export type PadBankManagerProps = Pick<
  PadBankApi,
  'slots' | 'activeBank' | 'selectedPadId' | 'padPlayMode' | 'chromaticRootOffset' | 'setPadPlayMode' | 'setChromaticRootOffset' | 'triggerPad' | 'deletePads' | 'copyPad' | 'storageReady'
>;

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
}) => {
  // Each finger is tracked by pointerId so simultaneous touches light and release independently.
  const activePointers = useRef(new Map<number, { padId: string; release: () => void }>());
  const gridRef = useRef<HTMLDivElement>(null);
  const [pressedPads, setPressedPads] = useState<ReadonlySet<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copySource, setCopySource] = useState<string | null>(null);
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
      for (const { release } of pointers.values()) release();
      pointers.clear();
    };
  }, [activeBank, padPlayMode]);

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

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, padId: string, index: number) => {
    if (activePointers.current.has(event.pointerId)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (copying) {
      if (!copySource) {
        if (slots[padId].sampleKey) setCopySource(padId);
      } else if (padId === copySource) {
        setCopySource(null);
      } else if (!slots[padId].sampleKey) {
        setCopyError('');
        void copyPad(copySource, padId).then(() => setCopySource(null)).catch((failure: unknown) => {
          setCopyError(failure instanceof Error ? failure.message : 'Could not copy pad.');
        });
      }
      return;
    }
    if (selecting) {
      toggleSelection(padId);
      return;
    }
    const source = padPlayMode === 'CHROMATIC_16' ? selectedPadId : padId;
    const pitch = padPlayMode === 'CHROMATIC_16' ? chromaticOffset(index, chromaticRootOffset) : 0;
    activePointers.current.set(event.pointerId, { padId, release: triggerPad(source, undefined, pitch) });
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
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      <div className="flex items-center justify-between gap-1 text-[9px]">
        <button type="button" aria-label="Toggle chromatic pad mode" aria-pressed={padPlayMode === 'CHROMATIC_16'}
          className="touch-none rounded border border-zinc-700 px-2 py-1 text-zinc-300"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setSelecting(false); setConfirming(false); setCopying(false); setCopySource(null);
            setPadPlayMode(padPlayMode === 'BANK_64' ? 'CHROMATIC_16' : 'BANK_64');
          }}>
          {padPlayMode === 'CHROMATIC_16' ? 'CHROMATIC' : 'BANK'}
        </button>
        {padPlayMode === 'CHROMATIC_16' && <label>ROOT
          <select aria-label="Chromatic root offset" value={chromaticRootOffset}
            className="bg-zinc-950 text-zinc-300" onChange={(event) => setChromaticRootOffset(Number(event.target.value))}>
            {Array.from({ length: 49 }, (_, i) => i - 24).map((value) =>
              <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
          </select>
        </label>}
        <button type="button" disabled={padPlayMode === 'CHROMATIC_16' || !storageReady || deleting} onClick={() => {
          setSelecting(!selecting); setCopying(false); setCopyError(''); setSelected(new Set()); setConfirming(false); setError('');
        }} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-300 disabled:opacity-40">
          {selecting ? 'CANCEL' : 'DEL'}
        </button>
        {!selecting &&         <button type="button" disabled={padPlayMode === 'CHROMATIC_16' || !storageReady} aria-pressed={copying} onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setCopying(!copying); setCopySource(null); setCopyError('');
        }} className={`rounded border px-2 py-1 disabled:opacity-40 ${copying ? 'border-cyan-600 text-cyan-300' : 'border-zinc-700 text-zinc-300'}`}>
          {copying ? 'CANCEL COPY' : 'COPY'}
        </button>}
        {selecting && <button type="button" disabled={!selected.size || deleting} onClick={() => setConfirming(true)}
          className="rounded border border-rose-800 bg-rose-950 px-2 py-1 text-rose-300 disabled:opacity-40">
          DELETE {selected.size}
        </button>}
      </div>
      {padPlayMode === 'CHROMATIC_16' && <div role="status" className="text-[9px] text-zinc-400">
        SOURCE {formatPadLabel(selectedPadId)}{slots[selectedPadId].sampleKey ? '' : ' — SELECT A LOADED PAD IN BANK MODE'}
      </div>}
      {copying && <div role={copyError ? 'alert' : 'status'} className={`text-[9px] ${copyError ? 'text-rose-300' : 'text-zinc-400'}`}>
        {copyError || (copySource ? `SOURCE ${formatPadLabel(copySource)} · SWITCH BANK, THEN TAP AN EMPTY DESTINATION` : 'TAP A LOADED SOURCE PAD')}
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
        const slot = slots[padPlayMode === 'CHROMATIC_16' ? selectedPadId : padId];
        const hasSample = slot.sampleKey !== null;
        const isSelected = selecting ? selected.has(padId) : padPlayMode === 'BANK_64' && padId === selectedPadId;
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
            onPointerDown={(event) => handlePointerDown(event, padId, i)}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={handlePointerEnd}
            onContextMenu={(event) => event.preventDefault()}
            className={`pad-trigger touch-none select-none min-h-[44px] border rounded p-1.5 flex flex-col justify-between text-left text-[9px] transition-all duration-75 ${
              isPressed
                ? 'bg-[var(--accent-phrase)] border-[var(--accent-phrase)] text-zinc-950 scale-95 shadow-[0_0_12px_rgba(34,211,238,0.7)]'
                : copying && copySource === padId
                ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                : isSelected
                ? 'bg-zinc-900 border-[var(--accent-phrase)] shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                : 'bg-zinc-950 border-zinc-800 hover:border-cyan-500/50'
            }`}
          >
            <span className="flex w-full items-center justify-between font-bold">
              <span className={isPressed ? 'text-zinc-900' : 'text-zinc-500'}>{padPlayMode === 'CHROMATIC_16' ? chromaticNote(chromaticOffset(i, chromaticRootOffset)) : formatPadLabel(padId)}</span>
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
