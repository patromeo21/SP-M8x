import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { percentFromFrame, rangeFromPercent, type SampleRange } from './sampleRange';
import { createWaveformPeakBuilder, type WaveformPeaks } from './waveformPeaks';
import type { PadBankApi, PadSlot } from './usePadBank';

const peakCache = new WeakMap<AudioBuffer, { width: number; start: number; end: number; peaks: WaveformPeaks }>();

interface Props {
  pad: PadSlot;
  onUpdatePad: PadBankApi['updatePad'];
  onPreviewRange: PadBankApi['previewRange'];
  sliceCount: number;
}

export const WaveformEditor: React.FC<Props> = ({ pad, onUpdatePad, onPreviewRange, sliceCount }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; edge: 'start' | 'end'; range: SampleRange; original: SampleRange; x: number; origin: number } | null>(null);
  const pitchDrag = useRef<{ pointerId: number; y: number; initial: number; value: number } | null>(null);
  const panDrag = useRef<{ pointerId: number; x: number; start: number } | null>(null);
  const [preview, setPreview] = useState<SampleRange | null>(null);
  const [pitchPreview, setPitchPreview] = useState<number | null>(null);
  const [precision, setPrecision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 96 });
  const [rendered, setRendered] = useState<{ buffer: AudioBuffer; width: number; start: number; end: number; peaks: WaveformPeaks } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState(0);
  const length = pad.buffer?.length ?? 0;
  const viewLength = Math.max(1, Math.ceil(length / zoom));
  const viewStart = Math.max(0, Math.min(length - viewLength, Math.round(position * length)));
  const viewEnd = Math.min(length, viewStart + viewLength);
  const peaks = rendered?.buffer === pad.buffer && rendered.width === Math.min(canvasSize.width, viewLength) &&
    rendered.start === viewStart && rendered.end === viewEnd ? rendered.peaks : null;
  const range = preview ?? (length ? rangeFromPercent(pad.startPct, pad.endPct, length) : { start: 0, end: 0 });

  useEffect(() => {
    drag.current = null;
    pitchDrag.current = null;
    setPreview(null);
    setPitchPreview(null);
    setPrecision(false);
    setError(null);
    setZoom(1);
    setPosition(0);
    return () => {
      const active = drag.current;
      if (active && length) {
        onPreviewRange(pad.id, percentFromFrame(active.original.start, length), percentFromFrame(active.original.end, length));
        drag.current = null;
      }
    };
  }, [pad.id, pad.sampleKey, length, onPreviewRange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.min(2048, Math.round(bounds.width * scale)));
      const height = Math.max(1, Math.min(512, Math.round(bounds.height * scale)));
      setCanvasSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const buffer = pad.buffer;
    if (!buffer) {
      setRendered(null);
      return;
    }
    const width = Math.min(canvasSize.width, viewLength);
    const cached = peakCache.get(buffer);
    if (cached?.width === width && cached.start === viewStart && cached.end === viewEnd) {
      setRendered({ buffer, width, start: viewStart, end: viewEnd, peaks: cached.peaks });
      return;
    }
    setRendered(null);
    const builder = createWaveformPeakBuilder(buffer, width, viewStart, viewEnd);
    let timer: number | undefined;
    const run = () => {
      if (builder.process(16384)) {
        peakCache.set(buffer, { width, start: viewStart, end: viewEnd, peaks: builder.peaks });
        setRendered({ buffer, width, start: viewStart, end: viewEnd, peaks: builder.peaks });
      } else {
        timer = window.setTimeout(run, zoom > 1 ? 80 : 0);
      }
    };
    timer = window.setTimeout(run, 0);
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [pad.buffer, canvasSize.width, viewLength, viewStart, viewEnd, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    if (!peaks || !length) return;
    const colWidth = width / peaks.min.length;
    for (let col = 0; col < peaks.min.length; col++) {
      const frame = viewStart + col * viewLength / peaks.min.length;
      ctx.fillStyle = frame >= range.start && frame < range.end ? '#00e6c3' : '#28313d';
      const center = height / 2;
      const scale = (height - 8) / 2;
      const top = center - peaks.max[col] * scale;
      const bottom = center - peaks.min[col] * scale;
      ctx.fillRect(col * colWidth, top, Math.max(1, colWidth), Math.max(1, bottom - top));
    }
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let index = 1; index < sliceCount; index++) {
      const frame = range.start + Math.floor(index * (range.end - range.start) / sliceCount);
      if (frame >= viewStart && frame <= viewEnd) ctx.fillRect(Math.round((frame - viewStart) * width / viewLength), 0, 1, height);
    }
  }, [peaks, length, range.start, range.end, sliceCount, canvasSize, viewStart, viewEnd, viewLength]);

  useEffect(() => {
    const playhead = playheadRef.current;
    const buffer = pad.buffer;
    if (!playhead || !buffer) return;
    let frame: number | null = null;
    const draw = () => {
      frame = null;
      const position = audioEngine.getPadPlaybackPosition(pad.id, buffer);
      const framePosition = position === null ? null : position * buffer.sampleRate;
      if (framePosition === null || framePosition < viewStart || framePosition > viewEnd) {
        playhead.style.display = 'none';
      } else {
        playhead.style.display = 'block';
        playhead.style.left = `${Math.min(100, Math.max(0, (framePosition - viewStart) * 100 / viewLength))}%`;
      }
      if (audioEngine.hasPadVoices(pad.id, buffer)) frame = requestAnimationFrame(draw);
    };
    const update = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      draw();
    };
    const unsubscribe = audioEngine.subscribeVoiceChanges(update);
    update();
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
      playhead.style.display = 'none';
    };
  }, [pad.id, pad.buffer, viewStart, viewEnd, viewLength]);

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
    const frame = Math.max(0, Math.min(length, active.origin + Math.round((event.clientX - active.x) * viewLength / bounds.width)));
    const next = active.edge === 'start'
      ? { ...active.range, start: Math.min(frame, active.range.end - 1) }
      : { ...active.range, end: Math.max(frame, active.range.start + 1) };
    active.range = next;
    setPreview(next);
    onPreviewRange(pad.id, percentFromFrame(next.start, length), percentFromFrame(next.end, length));
  };

  const marker = (edge: 'start' | 'end') => (
    <button
      type="button"
      aria-label={`${edge === 'start' ? 'Start' : 'End'} marker`}
      disabled={!pad.buffer}
      className={`slice-handle slice-handle-${edge}`}
      style={{ display: range[edge] < viewStart || range[edge] > viewEnd ? 'none' : undefined, left: `clamp(22px, ${length ? (range[edge] - viewStart) * 100 / viewLength : 0}%, calc(100% - 22px))` }}
      onPointerDown={(event) => {
        if (drag.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, edge, range, original: range, x: event.clientX, origin: range[edge] };
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
        const original = drag.current.original;
        drag.current = null;
        setPreview(null);
        onPreviewRange(pad.id, percentFromFrame(original.start, length), percentFromFrame(original.end, length));
      }}
      onLostPointerCapture={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        const original = drag.current.original;
        drag.current = null;
        setPreview(null);
        onPreviewRange(pad.id, percentFromFrame(original.start, length), percentFromFrame(original.end, length));
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
      <canvas ref={canvasRef} width={canvasSize.width} height={canvasSize.height} className="absolute inset-0 w-full h-full"
        onPointerDown={(event) => {
          if (zoom === 1 || panDrag.current) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          panDrag.current = { pointerId: event.pointerId, x: event.clientX, start: position };
        }}
        onPointerMove={(event) => {
          const drag = panDrag.current;
          const bounds = containerRef.current?.getBoundingClientRect();
          if (!drag || drag.pointerId !== event.pointerId || !bounds) return;
          setPosition(Math.max(0, Math.min(1 - 1 / zoom, drag.start - (event.clientX - drag.x) / bounds.width / zoom)));
        }}
        onPointerUp={(event) => { if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null; }}
        onPointerCancel={(event) => { if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null; }}
        onLostPointerCapture={(event) => { if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null; }} />
      <div ref={playheadRef} aria-hidden="true" style={{ display: 'none' }}
        className="absolute top-0 bottom-0 w-px bg-white pointer-events-none z-[1]" />
      {!pad.buffer && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 text-[11px] pointer-events-none">
          <span className="text-zinc-400 font-bold">{pad.loading ? 'LOADING SAMPLE' : pad.sampleKey ? pad.name : 'NO SAMPLE LOADED'}</span>
          <span className="text-[9px] text-zinc-600">{pad.sampleKey ? 'TAP PAD TO LOAD' : 'WAVEFORM / SLICING GRID'}</span>
        </div>
      )}
      {pad.buffer && !peaks && <span className="absolute inset-0 flex items-center justify-center text-[9px] text-zinc-500 pointer-events-none">DRAWING WAVEFORM</span>}
      {pad.buffer && <>
        <div className="absolute top-0 inset-x-1 flex items-center justify-between gap-2 text-[9px] pointer-events-none">
          <span className="min-w-0 truncate text-cyan-300">{pad.name}</span>
          <span className="shrink-0 text-zinc-400" aria-label="Decoded audio format">
            {pad.buffer.sampleRate} Hz · {pad.buffer.numberOfChannels === 1 ? 'MONO' : pad.buffer.numberOfChannels === 2 ? 'STEREO' : `${pad.buffer.numberOfChannels} CH`} · {pad.buffer.duration.toFixed(2)}s
          </span>
        </div>
        {marker('start')}
        {marker('end')}
        <div className="wave-zoom">
          {[0.5, 2].map((factor) => (
            <button key={factor} type="button" aria-label={factor < 1 ? 'Zoom out waveform' : 'Zoom in waveform'}
              disabled={factor < 1 ? zoom === 1 : zoom === 32}
              onClick={() => {
                const next = Math.max(1, Math.min(32, zoom * factor));
                const center = position + 0.5 / zoom;
                setPosition(Math.max(0, Math.min(1 - 1 / next, center - 0.5 / next)));
                setZoom(next);
              }}>{factor < 1 ? '−' : '+'}</button>
          ))}
          <span>{zoom}×</span>
        </div>
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
