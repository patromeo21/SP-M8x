import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { trackerEngine } from '../tracker/trackerEngine';
import type { FxBus, MacroFx, RmxLength } from './fxEngine';

type Trigger = MacroFx | 'rmx' | 'drive';
type Held = { bus: FxBus; effect: Trigger; ready: boolean };

const triggers: { effect: Trigger; label: string }[] = [
  { effect: 'filter', label: 'FILTER' },
  { effect: 'rmx', label: 'RMX' },
  { effect: 'drive', label: 'DRIVE' },
  { effect: 'lofi', label: 'LO-FI' },
  { effect: 'chorus', label: 'CHORUS' },
  { effect: 'mute', label: 'PUNCH-MUTE' },
];
const buses: FxBus[] = ['A', 'B', 'MST'];
const lengths: RmxLength[] = [1, 2, 4];

const deckForBus = (target: FxBus): 0 | 1 | null =>
  target === 'A' ? 0 : target === 'B' ? 1 : null;

export function FxStrip() {
  const [bus, setBus] = useState<FxBus>('MST');
  const [length, setLength] = useState<RmxLength>(1);
  const [pressed, setPressed] = useState<readonly Held[]>([]);
  const [error, setError] = useState('');
  const pointers = useRef(new Map<number, Held>());
  const initialized = useRef(false);

  const applyLaneFx = (target: FxBus, active: MacroFx) => {
    if (!initialized.current) return;
    audioEngine.setMacroFx(target, active);
    const deck = deckForBus(target);
    if (deck !== null) {
      audioEngine.setPerformanceFx(deck, active === 'filter' ? 'filter' : 'off');
    }
  };

  const syncBus = (target: FxBus) => {
    let active: MacroFx = 'off';
    for (const held of pointers.current.values()) {
      if (
        held.bus === target &&
        held.effect !== 'rmx' &&
        held.effect !== 'drive' &&
        held.effect !== 'off' &&
        held.ready
      ) {
        active = held.effect;
      }
    }
    applyLaneFx(target, active);
    setPressed([...pointers.current.values()]);
  };

  useEffect(() => () => {
    pointers.current.clear();
    trackerEngine.stopRmx();
    if (initialized.current) {
      buses.forEach((target) => {
        audioEngine.setMacroFx(target, 'off');
        const deck = deckForBus(target);
        if (deck !== null) audioEngine.setPerformanceFx(deck, 'off');
      });
    }
  }, []);

  const end = (pointerId: number) => {
    const held = pointers.current.get(pointerId);
    if (!held) return;
    pointers.current.delete(pointerId);
    if (held.effect === 'rmx') trackerEngine.stopRmx();
    syncBus(held.bus);
  };

  return (
    <div className="macro-dock" aria-label="Performance macro dock">
      <div className="macro-presets-overlay">
        <div className="macro-presets" aria-label="RMX repeat length">
          {lengths.map((value, index) => (
            <button
              type="button"
              key={value}
              aria-label={`RMX preset ${index + 1}: ${value} ${value === 1 ? 'row' : 'rows'}`}
              aria-pressed={length === value}
              disabled={pressed.some((held) => held.effect === 'rmx')}
              className={length === value ? 'is-selected' : ''}
              onClick={() => setLength(value)}
            >
              P{index + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="macro-row">
        <div className="macro-bus-selector" aria-label="Macro bus">
          {buses.map((target) => (
            <button
              type="button"
              key={target}
              aria-label={`Macro bus ${target}`}
              aria-pressed={bus === target}
              className={bus === target ? 'is-selected' : ''}
              onClick={() => setBus(target)}
            >
              {target}
            </button>
          ))}
        </div>
        {triggers.map(({ effect, label }) => (
          <button
            type="button"
            key={effect}
            aria-label={`${label} punch-in`}
            aria-pressed={pressed.some((held) => held.bus === bus && held.effect === effect && held.ready)}
            className="macro-trigger"
            onPointerDown={(event) => {
              event.preventDefault();
              if (pointers.current.has(event.pointerId)) return;
              if (effect === 'rmx' && [...pointers.current.values()].some((held) => held.effect === 'rmx')) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const held: Held = { bus, effect, ready: false };

              if (effect === 'rmx') {
                if (!trackerEngine.startRmx(bus, length)) {
                  setError('START PLAYBACK BEFORE RMX');
                  return;
                }
                held.ready = true;
                pointers.current.set(event.pointerId, held);
                setPressed([...pointers.current.values()]);
                setError('');
                return;
              }

              // DRIVE is intentionally sidelined until your effects prompts are reviewed
              if (effect === 'drive') {
                held.ready = true;
                pointers.current.set(event.pointerId, held);
                setPressed([...pointers.current.values()]);
                setError('');
                return;
              }

              const pointerId = event.pointerId;
              pointers.current.set(pointerId, held);
              setPressed([...pointers.current.values()]);
              setError('');
              void audioEngine.initialize().then(() => {
                if (pointers.current.get(pointerId) !== held) return;
                initialized.current = true;
                held.ready = true;
                syncBus(held.bus);
              }).catch((failure: unknown) => {
                console.error('[SP-M8x] Could not activate macro FX:', failure);
                if (pointers.current.get(pointerId) === held) {
                  pointers.current.delete(pointerId);
                  setPressed([...pointers.current.values()]);
                  setError('MACRO FX UNAVAILABLE');
                }
              });
            }}
            onPointerUp={(event) => end(event.pointerId)}
            onPointerCancel={(event) => end(event.pointerId)}
            onLostPointerCapture={(event) => end(event.pointerId)}
            onContextMenu={(event) => event.preventDefault()}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <span role="alert" className="text-[9px] text-rose-400">{error}</span>}
    </div>
  );
}

export default FxStrip;