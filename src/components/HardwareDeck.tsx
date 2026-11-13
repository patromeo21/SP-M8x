/**
 * SP-M8x Hardware Deck Component
 * M8 tactile 8-button physical layout with pointerId-safe multi-touch handling
 * for mobile Safari (iPad 9th Gen), supporting single-tap, hold, and double-tap SHIFT states.
 */

import React, { useState, useRef, useCallback } from 'react';

export interface HardwareDeckProps {
  onButtonPress?: (button: string, isShiftHeld: boolean) => void;
  onButtonRelease?: (button: string) => void;
  onFxGateToggle?: (fxType: string, active: boolean, targetTrack?: number) => void;
  onShiftAction?: (action: 'tap' | 'hold_start' | 'hold_end' | 'latch') => void;
  activeTrackIndex?: number;
  isMasterTarget?: boolean;
}

export const HardwareDeck: React.FC<HardwareDeckProps> = ({
  onButtonPress,
  onButtonRelease,
  onFxGateToggle,
  onShiftAction,
  activeTrackIndex = 0,
  isMasterTarget = false,
}) => {
  // Shift State Machine: 'idle' | 'held' | 'latched'
  const [shiftState, setShiftState] = useState<'idle' | 'held' | 'latched'>('idle');
  const [activeFx, setActiveFx] = useState<string | null>(null);

  // Timers & Pointer Trackers utilizing safe type inference to avoid parser generic errors
  const shiftPressTimeRef = useRef<number>(0);
  const lastShiftTapRef = useRef<number>(0);
  const activePointersRef = useRef(new Map<string, number>());

  // --- SHIFT Gesture Handlers ---
  const handleShiftPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set('SHIFT', e.pointerId);
    shiftPressTimeRef.current = Date.now();

    const now = Date.now();
    const timeSinceLastTap = now - lastShiftTapRef.current;

    if (shiftState === 'latched') {
      setShiftState('idle');
      onShiftAction?.('tap');
      lastShiftTapRef.current = 0;
      return;
    }

    if (timeSinceLastTap < 250) {
      setShiftState('latched');
      onShiftAction?.('latch');
      lastShiftTapRef.current = 0;
      return;
    }

    // Since 'latched' is already returned above, shiftState here is strictly 'idle' or 'held'
    setShiftState('held');
    onShiftAction?.('hold_start');
  }, [shiftState, onShiftAction]);

  const handleShiftPointerUp = useCallback((e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    activePointersRef.current.delete('SHIFT');

    const holdDuration = Date.now() - shiftPressTimeRef.current;

    if (shiftState === 'held') {
      if (holdDuration < 200) {
        setShiftState('idle');
        onShiftAction?.('tap');
        lastShiftTapRef.current = Date.now();
      } else {
        setShiftState('idle');
        onShiftAction?.('hold_end');
        setActiveFx(null);
      }
    }
  }, [shiftState, onShiftAction]);

  // --- General Deck Button Handlers (Multi-Touch / Pointer Safe) ---
  const handleButtonDown = useCallback((buttonName: string, e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(buttonName, e.pointerId);

    const isShiftActive = shiftState === 'held' || shiftState === 'latched';

    if (isShiftActive) {
      let fxType = '';
      if (buttonName === 'UP') fxType = 'CUT';
      else if (buttonName === 'DOWN') fxType = 'RET';
      else if (buttonName === 'LEFT') fxType = 'KILL';
      else if (buttonName === 'RIGHT') fxType = 'DEG';
      else if (buttonName === 'EDT') fxType = 'SDL';
      else if (buttonName === 'OPT') fxType = 'TRK_MST';

      if (fxType) {
        setActiveFx(fxType);
        onFxGateToggle?.(fxType, true, isMasterTarget ? -1 : activeTrackIndex);
        return;
      }
    }

    onButtonPress?.(buttonName, isShiftActive);
  }, [shiftState, activeTrackIndex, isMasterTarget, onFxGateToggle, onButtonPress]);

  const handleButtonUp = useCallback((buttonName: string, e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    activePointersRef.current.delete(buttonName);

    let fxType = '';
    if (buttonName === 'UP') fxType = 'CUT';
    else if (buttonName === 'DOWN') fxType = 'RET';
    else if (buttonName === 'LEFT') fxType = 'KILL';
    else if (buttonName === 'RIGHT') fxType = 'DEG';
    else if (buttonName === 'EDT') fxType = 'SDL';

    if (fxType && activeFx === fxType) {
      setActiveFx(null);
      onFxGateToggle?.(fxType, false, isMasterTarget ? -1 : activeTrackIndex);
    }

    onButtonRelease?.(buttonName);
  }, [activeFx, activeTrackIndex, isMasterTarget, onFxGateToggle, onButtonRelease]);

  const isShiftActive = shiftState === 'held' || shiftState === 'latched';

  return (
    <div className="hardware-deck bg-neutral-900 border border-neutral-700 p-3 rounded-lg select-none touch-none">
      {/* Status Header */}
      <div className="flex justify-between items-center mb-2 px-1 text-xs text-neutral-400 font-mono">
        <span>DECK: M8 TACTILE</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
          shiftState === 'latched' ? 'bg-red-600 text-white animate-pulse' :
          shiftState === 'held' ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-300'
        }`}>
          {shiftState === 'latched' ? 'FX LATCHED [ON]' : shiftState === 'held' ? 'FX LAYER [HOLD]' : 'M8 NAV [READY]'}
        </span>
      </div>

      {/* 8-Button Tactile Grid */}
      <div className="grid grid-cols-4 gap-2">
        <button
          className={`h-12 rounded font-bold text-xs flex flex-col items-center justify-center transition-all ${
            isShiftActive ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/50' : 'bg-neutral-800 text-neutral-200 active:bg-neutral-700'
          }`}
          onPointerDown={(e) => handleButtonDown('UP', e)}
          onPointerUp={(e) => handleButtonUp('UP', e)}
          onPointerCancel={(e) => handleButtonUp('UP', e)}
        >
          <span>{isShiftActive ? 'CUT' : '▲'}</span>
          <span className="text-[9px] opacity-60">{isShiftActive ? 'Filter' : 'UP'}</span>
        </button>

        <button
          className="h-12 bg-neutral-800 active:bg-neutral-700 text-neutral-200 rounded font-bold text-xs flex flex-col items-center justify-center"
          onPointerDown={(e) => handleButtonDown('OPT', e)}
          onPointerUp={(e) => handleButtonUp('OPT', e)}
          onPointerCancel={(e) => handleButtonUp('OPT', e)}
        >
          <span>{isShiftActive ? (isMasterTarget ? 'MST' : 'TRK') : 'OPT'}</span>
          <span className="text-[9px] opacity-60">{isShiftActive ? 'Target' : 'Select'}</span>
        </button>

        <button
          className={`h-12 rounded font-bold text-xs flex flex-col items-center justify-center transition-all ${
            isShiftActive ? 'bg-red-600 text-white shadow-lg shadow-red-900/50' : 'bg-neutral-800 text-neutral-200 active:bg-neutral-700'
          }`}
          onPointerDown={(e) => handleButtonDown('DOWN', e)}
          onPointerUp={(e) => handleButtonUp('DOWN', e)}
          onPointerCancel={(e) => handleButtonUp('DOWN', e)}
        >
          <span>{isShiftActive ? 'RET' : '▼'}</span>
          <span className="text-[9px] opacity-60">{isShiftActive ? 'Looper' : 'DOWN'}</span>
        </button>

        <button
          className={`h-12 rounded font-bold text-xs flex flex-col items-center justify-center transition-all ${
            isShiftActive ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'bg-neutral-800 text-neutral-200 active:bg-neutral-700'
          }`}
          onPointerDown={(e) => handleButtonDown('EDT', e)}
          onPointerUp={(e) => handleButtonDown('EDT', e)}
          onPointerCancel={(e) => handleButtonDown('EDT', e)}
        >
          <span>{isShiftActive ? 'SDL' : 'EDT'}</span>
          <span className="text-[9px] opacity-60">{isShiftActive ? 'Delay' : 'Insert'}</span>
        </button>

        <button
          className={`h-12 rounded font-bold text-xs flex flex-col items-center justify-center transition-all ${
            isShiftActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'bg-neutral-800 text-neutral-200 active:bg-neutral-700'
          }`}
          onPointerDown={(e) => handleButtonDown('LEFT', e)}
          onPointerUp={(e) => handleButtonUp('LEFT', e)}
          onPointerCancel={(e) => handleButtonUp('LEFT', e)}
        >
          <span>{isShiftActive ? 'KILL' : '◄'}</span>
          <span className="text-[9px] opacity-60">{isShiftActive ? 'Mute' : 'LEFT'}</span>
        </button>

        <button
          className={`h-12 rounded font-bold text-xs flex flex-col items-center justify-center transition-all ${
            isShiftActive ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'bg-neutral-800 text-neutral-200 active:bg-neutral-700'
          }`}
          onPointerDown={(e) => handleButtonDown('RIGHT', e)}
          onPointerUp={(e) => handleButtonUp('RIGHT', e)}
          onPointerCancel={(e) => handleButtonUp('RIGHT', e)}
        >
          <span>{isShiftActive ? 'DEG' : '►'}</span>
          <span className="text-[9px] opacity-60">{isShiftActive ? 'Crush' : 'RIGHT'}</span>
        </button>

        <button
          className={`h-12 rounded font-bold text-xs flex flex-col items-center justify-center transition-all ${
            shiftState !== 'idle' ? 'bg-amber-500 text-black font-extrabold ring-2 ring-white' : 'bg-neutral-700 text-neutral-100 active:bg-neutral-600'
          }`}
          onPointerDown={handleShiftPointerDown}
          onPointerUp={handleShiftPointerUp}
          onPointerCancel={handleShiftPointerUp}
        >
          <span>SHIFT</span>
          <span className="text-[9px] opacity-70">{shiftState === 'latched' ? 'LATCH' : shiftState === 'held' ? 'HOLD' : 'MOD'}</span>
        </button>

        <button
          className="h-12 bg-neutral-800 active:bg-neutral-700 text-neutral-200 rounded font-bold text-xs flex flex-col items-center justify-center"
          onPointerDown={(e) => handleButtonDown('PLAY', e)}
          onPointerUp={(e) => handleButtonUp('PLAY', e)}
          onPointerCancel={(e) => handleButtonUp('PLAY', e)}
        >
          <span>PLAY</span>
          <span className="text-[9px] opacity-60">Start/Stop</span>
        </button>
      </div>
    </div>
  );
};