import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import type { PerformanceFx } from './PerformanceDeck';

const effects: PerformanceFx[] = ['filter', 'drive', 'delay', 'off'];

export function PerformanceDeckControls() {
  const pointers = useRef(new Map<number, { deck: 0 | 1; effect: PerformanceFx }>());
  const [active, setActive] = useState<[PerformanceFx, PerformanceFx]>(['off', 'off']);
  const [error, setError] = useState('');
  const sync = (deck: 0 | 1) => {
    const held = [...pointers.current.values()].filter((item) => item.deck === deck);
    const effect = held.at(-1)?.effect ?? 'off';
    if (audioEngine.getContext()) audioEngine.setPerformanceFx(deck, effect);
    setActive((previous) => deck === 0 ? [effect, previous[1]] : [previous[0], effect]);
  };
  useEffect(() => () => {
    pointers.current.clear();
    if (audioEngine.getContext()) {
      audioEngine.setPerformanceFx(0, 'off');
      audioEngine.setPerformanceFx(1, 'off');
    }
  }, []);

  return <div className="flex flex-col gap-1">
    {([0, 1] as const).map((deck) => <div key={deck} className="flex items-center gap-1">
      <strong className="text-[9px] text-zinc-400">DECK {deck === 0 ? 'A' : 'B'}</strong>
      {effects.map((effect) => <button key={effect} type="button" aria-label={`Deck ${deck === 0 ? 'A' : 'B'} ${effect}`}
        data-performance-touch
        aria-pressed={active[deck] === effect && effect !== 'off'}
        className="touch-none select-none flex-1 min-h-[36px] border border-zinc-700 rounded text-[9px] text-cyan-300"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { deck, effect });
          void audioEngine.initialize().then(() => {
            if (pointers.current.has(event.pointerId)) sync(deck);
          }).catch((failure: unknown) => {
            console.error('[SP-M8x] Could not activate performance FX:', failure);
            setError('PERFORMANCE FX UNAVAILABLE');
          });
        }}
        onPointerUp={(event) => { if (pointers.current.delete(event.pointerId)) sync(deck); }}
        onPointerCancel={(event) => { if (pointers.current.delete(event.pointerId)) sync(deck); }}
        onLostPointerCapture={(event) => { if (pointers.current.delete(event.pointerId)) sync(deck); }}>
        {effect.toUpperCase()}
      </button>)}
    </div>)}
    {error && <span role="alert" className="text-rose-400">{error}</span>}
  </div>;
}
