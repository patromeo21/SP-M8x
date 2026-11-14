import React, { useRef, useState } from 'react';

export function useStepDeletion(clear: (indices: number[]) => void) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [holding, setHolding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pointer = useRef<number | null>(null);
  const suppressedClicks = useRef(new Set<number>());

  const end = (id: number, cancelled: boolean) => {
    if (pointer.current !== id) return;
    pointer.current = null;
    setHolding(false);
    if (cancelled) {
      setSelected(new Set());
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  const controls = confirming && selected.size ? (
    <span className="flex items-center gap-2">
      <span role="status" className="text-amber-300">{selected.size} SELECTED</span>
      <button type="button" className="border border-rose-800 text-rose-300 rounded px-2 py-1" onClick={() => {
        clear([...selected]);
        setSelected(new Set());
        setConfirming(false);
      }}>DELETE</button>
      <button type="button" className="border border-zinc-700 rounded px-2 py-1" onClick={() => {
        setSelected(new Set());
        setConfirming(false);
      }}>CANCEL</button>
    </span>
  ) : (
    <button type="button" aria-label="Hold DEL OP and tap steps to select for deletion" aria-pressed={holding}
      className={`touch-none select-none border rounded px-2 py-1 ${holding ? 'border-rose-400 text-rose-300' : 'border-zinc-700 text-zinc-300'}`}
      onPointerDown={(event) => {
        if (pointer.current !== null || (!event.isPrimary && event.pointerType === 'mouse')) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        setSelected(new Set());
        setConfirming(false);
        setHolding(true);
      }}
      onPointerUp={(event) => end(event.pointerId, false)}
      onPointerCancel={(event) => end(event.pointerId, true)}
      onLostPointerCapture={(event) => end(event.pointerId, true)}>DEL/OP</button>
  );

  return {
    selected,
    controls,
    onPointerDown: (event: React.PointerEvent, index: number, occupied: boolean) => {
      if (pointer.current === null) {
        suppressedClicks.current.delete(index);
        return;
      }
      if (!occupied) return;
      event.preventDefault();
      suppressedClicks.current.add(index);
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(index)) next.delete(index); else next.add(index);
        return next;
      });
    },
    onPointerCancel: (index: number) => { suppressedClicks.current.delete(index); },
    consumeClick: (index: number) => suppressedClicks.current.delete(index) || pointer.current !== null || confirming,
  };
}
