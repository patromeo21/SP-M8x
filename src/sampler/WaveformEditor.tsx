import React, { useEffect, useMemo, useRef, useState } from 'react';
import { percentFromFrame, rangeFromPercent, type SampleRange } from './sampleRange';
import type { PadBankApi, PadSlot } from './usePadBank';

const WAVE_COLUMNS = 240;

function computePeaks(buffer: AudioBuffer): Float32Array {
  const peaks = new Float32Array(WAVE_COLUMNS);
  const channel = buffer.getChannelData(0);
  for (let col = 0; col < WAVE_COLUMNS; col++) {
    const from = Math.floor(col * channel.length / WAVE_COLUMNS);
    const to = Math.floor((col + 1) * channel.length / WAVE_COLUMNS);
    let max = 0;
    for (let i = from; i < to; i++) max = Math.max(max, Math.abs(channel[i]));
    peaks[col] = max;
  }
  return peaks;
}

interface Props {
  pad: PadSlot;
  onUpdatePad: PadBankApi['updatePad'];
}

export const WaveformEditor: React.FC<Props> = ({ pad, onUpdatePad }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pointerId: number; edge: 'start' | 'end'; range: SampleRange; x: number; origin: number } | null>(null);
  const pitchDrag = useRef<{ pointerId: number; y: number; initial: number; value: number } | null>(null);
  const [preview, setPreview] = useState<SampleRange | null>(null);
  const [pitchPreview, setPitchPreview] = useState<number | null>(null);
  const [precision, setPrecision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peaks = useMemo(() => pad.buffer ? computePeaks(pad.buffer) : null, [pad.buffer]);
  const length = pad.buffer?.length ?? 0;
  const range = preview ?? (length ? rangeFromPercent(pad.startPct, pad.endPct, length) : { start: 0, end: 0 });

  useEffect(() => {
    drag.current = null;
    pitchDrag.current = null;
    setPreview(null);
    setPitchPreview(null);
    setPrecision(false);
    setError(null);
  }, [pad.id, pad.sampleKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    if (!peaks || !length) return;
    const colWidth = width / WAVE_COLUMNS;
    for (let col = 0; col < WAVE_COLUMNS; col++) {
      const frame = col * length / WAVE_COLUMNS;
      ctx.fillStyle = frame >= range.start && frame < range.end ? '#00e6c3' : '#28313d';
      const h = Math.max(1, peaks[col] * (height - 8));
      ctx.fillRect(col * colWidth, (height - h) / 2, Math.max(1, colWidth - 0.5), h);
    }
  }, [peaks, length, range.start, range.end]);

  const commitRange = (next: SampleRange) => {
    if (!length) return;
    onUpdatePad(pad.id, {
      startPct: percentFromFrame(next.start, length),
      endPct: percentFromFrame(next.end, length),
    });
  };

  const moveMarker = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!active || active.pointerId !== event.pointerId || !bounds || !length) return;
    const frame = Math.max(0, Math.min(length, active.origin + Math.round((event.clientX - active.x) * length / bounds.width)));
    const next = active.edge === 'start'
      ? { ...active.range, start: Math.min(frame, active.range.end - 1) }
      : { ...active.range, end: Math.max(frame, active.range.start + 1) };
    active.range = next;
    setPreview(next);
  };

  const marker = (edge: 'start' | 'end') => (
    <button
      type="button"
      aria-label={`${edge === 'start' ? 'Start' : 'End'} marker`}
      disabled={!pad.buffer}
      className={`slice-handle slice-handle-${edge}`}
      style={{ left: `clamp(22px, ${length ? range[edge] * 100 / length : edge === 'start' ? 0 : 100}%, calc(100% - 22px))` }}
      onPointerDown={(event) => {
        if (drag.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, edge, range, x: event.clientX, origin: range[edge] };
      }}
      onPointerMove={moveMarker}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        const next = drag.current.range;
        drag.current = null;
        setPreview(null);
        commitRange(next);
      }}
      onPointerCancel={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        setPreview(null);
      }}
      onLostPointerCapture={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        setPreview(null);
      }}
      onKeyDown={(event) => {
        if (!length || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        commitRange(edge === 'start'
          ? { ...range, start: Math.max(0, Math.min(range.end - 1, range.start + delta)) }
          : { ...range, end: Math.max(range.start + 1, Math.min(length, range.end + delta)) });
      }}
    >
      <span>{edge === 'start' ? 'S' : 'E'}</span>
    </button>
  );

  return (
    <div ref={containerRef} className="sampler-waveform relative h-24 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden mb-2 shrink-0">
      <canvas ref={canvasRef} width={600} height={96} className="absolute inset-0 w-full h-full" />
      {!pad.buffer && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 text-[11px] pointer-events-none">
          <span className="text-zinc-400 font-bold">{pad.loading ? 'LOADING SAMPLE' : pad.sampleKey ? pad.name : 'NO SAMPLE LOADED'}</span>
          <span className="text-[9px] text-zinc-600">{pad.sampleKey ? 'TAP PAD TO LOAD' : 'WAVEFORM / SLICING GRID'}</span>
        </div>
      )}
      {pad.buffer && <>
        <span className="absolute top-0 left-1 text-[9px] text-cyan-300 pointer-events-none">{pad.name}</span>
        {marker('start')}
        {marker('end')}
        <button type="button" className="wave-precision" onClick={() => { setPrecision(!precision); setError(null); }}>
          {precision ? 'DONE' : 'FRAMES'}
        </button>
        <button
          type="button"
          className={`wave-pitch${pitchPreview !== null ? ' wave-pitch-active' : ''}`}
          aria-label={`Pitch ${pad.pitch} semitones. Hold and slide up or down to adjust.`}
          onPointerDown={(event) => {
            if (pitchDrag.current) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            pitchDrag.current = { pointerId: event.pointerId, y: event.clientY, initial: pad.pitch, value: pad.pitch };
            setPitchPreview(pad.pitch);
          }}
          onPointerMove={(event) => {
            const active = pitchDrag.current;
            if (!active || active.pointerId !== event.pointerId) return;
            active.value = Math.max(-12, Math.min(12, active.initial + Math.round((active.y - event.clientY) / 8)));
            setPitchPreview(active.value);
          }}
          onPointerUp={(event) => {
            const active = pitchDrag.current;
            if (!active || active.pointerId !== event.pointerId) return;
            pitchDrag.current = null;
            setPitchPreview(null);
            onUpdatePad(pad.id, { pitch: active.value });
          }}
          onPointerCancel={(event) => {
            if (pitchDrag.current?.pointerId !== event.pointerId) return;
            pitchDrag.current = null;
            setPitchPreview(null);
          }}
          onLostPointerCapture={(event) => {
            if (pitchDrag.current?.pointerId !== event.pointerId) return;
            pitchDrag.current = null;
            setPitchPreview(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            onUpdatePad(pad.id, { pitch: Math.max(-12, Math.min(12, pad.pitch + (event.key === 'ArrowUp' ? 1 : -1))) });
          }}
        >
          {pitchPreview === null ? `P ${pad.pitch > 0 ? '+' : ''}${pad.pitch}` : (
            <>
              <span>{`↕ ${pitchPreview > 0 ? '+' : ''}${pitchPreview} ST`}</span>
              <span className="pitch-scale"><span style={{ left: `${(pitchPreview + 12) * 100 / 24}%` }} /></span>
            </>
          )}
        </button>
        {precision && (
          <div className="wave-frame-editor">
            <FrameField key={`${pad.id}-start`} label="START" value={range.start} min={0} max={range.end - 1}
              onError={setError} onChange={(start) => { setError(null); commitRange({ ...range, start }); }} />
            <FrameField key={`${pad.id}-end`} label="END" value={range.end} min={range.start + 1} max={length}
              onError={setError} onChange={(end) => { setError(null); commitRange({ ...range, end }); }} />
          </div>
        )}
      </>}
      {error && <span role="alert" className="wave-error">{error}</span>}
    </div>
  );
};

interface FrameFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onError: (message: string | null) => void;
}

const FrameField: React.FC<FrameFieldProps> = ({ label, value, min, max, onChange, onError }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const frame = Number(draft);
    if (!/^\d+$/.test(draft) || !Number.isSafeInteger(frame) || frame < min || frame > max) {
      onError(`${label} frame must be ${min}–${max}.`);
      setDraft(String(value));
      return;
    }
    onChange(frame);
  };
  return (
    <label className="wave-frame-label">
      {label}
      <input aria-label={`${label} sample frame`} type="text" inputMode="numeric" value={draft}
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    </label>
  );
};
