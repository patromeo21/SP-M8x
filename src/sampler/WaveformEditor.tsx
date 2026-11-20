import React, { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { percentFromFrame, rangeFromPercent, type SampleRange } from './sampleRange';
import { markerRangeAtPointer } from './waveformGesture';
import type { PadBankApi, PadSlot } from './usePadBank';
import type { AudioWaveformCanvasProps } from './AudioWaveformCanvas';

interface Props {
  pad: PadSlot;
  onUpdatePad: PadBankApi['updatePad'];
  onPreviewRange: PadBankApi['previewRange'];
  sliceCount: number;
  renderWaveform: (props: Omit<AudioWaveformCanvasProps, 'audioBuffer'>) => React.ReactNode;
}

export const WaveformEditor: React.FC<Props> = ({ pad, onUpdatePad, onPreviewRange, sliceCount, renderWaveform }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; edge: 'start' | 'end'; range: SampleRange; original: SampleRange; x: number; origin: number } | null>(null);
  const waveformPointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ ids: [number, number]; distance: number; zoom: number; centerFrame: number } | null>(null);
  const scrubPointer = useRef<number | null>(null);
  const [preview, setPreview] = useState<SampleRange | null>(null);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [precision, setPrecision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waveformPlaying, setWaveformPlaying] = useState(false);
  const [playheadNorm, setPlayheadNorm] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState(0);
  const length = pad.buffer?.length ?? 0;
  const viewLength = Math.max(1, Math.ceil(length / zoom));
  const viewStart = Math.max(0, Math.min(length - viewLength, Math.round(position * length)));
  const viewEnd = Math.min(length, viewStart + viewLength);
  const range = preview ?? (length ? rangeFromPercent(pad.startPct, pad.endPct, length) : { start: 0, end: 0 });
  const sliceMarkerFrames = useMemo(() => sliceCount > 0
    ? Array.from({ length: sliceCount - 1 }, (_, index) => range.start + Math.floor((index + 1) * (range.end - range.start) / sliceCount))
    : pad.sliceMarkers.slice(1, -1),
  [sliceCount, range.start, range.end, pad.sliceMarkers]);
  const sliceMarkerNorms = useMemo(() => length ? sliceMarkerFrames.map((frame) => frame / length) : [],
    [sliceMarkerFrames, length]);

  useEffect(() => {
    drag.current = null;
    setPreview(null);
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
    const buffer = pad.buffer;
    if (!buffer) {
      setWaveformPlaying(false);
      setPlayheadNorm(0);
      return;
    }
    let frame: number | null = null;
    const draw = () => {
      frame = null;
      const position = audioEngine.getPadPlaybackPosition(pad.id, buffer);
      const playing = audioEngine.hasPadVoices(pad.id, buffer);
      setWaveformPlaying(playing);
      if (position !== null) setPlayheadNorm(Math.max(0, Math.min(1, position / buffer.duration)));
      if (playing) frame = requestAnimationFrame(draw);
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
    };
  }, [pad.id, pad.buffer]);

  const commitRange = (next: SampleRange) => {
    if (!length) return;
    onUpdatePad(pad.id, {
      startPct: percentFromFrame(next.start, length),
      endPct: percentFromFrame(next.end, length),
    });
  };

  const snapTrimToView = () => {
    if (!length || viewEnd <= viewStart) return;
    const next = { start: viewStart, end: viewEnd };
    setPreview(null);
    onUpdatePad(pad.id, {
      startPct: percentFromFrame(next.start, length),
      endPct: percentFromFrame(next.end, length),
    });
  };

  const moveMarker = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!active || active.pointerId !== event.pointerId || !bounds || bounds.width <= 0 || !length) return;
    const next = markerRangeAtPointer(active.original, active.edge, active.origin, active.x, event.clientX, viewLength, bounds.width, length);
    active.range = next;
    setPreview(next);
    onPreviewRange(pad.id, percentFromFrame(next.start, length), percentFromFrame(next.end, length));
  };

  const scrubAt = (clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || !length) return;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const frame = Math.max(range.start, Math.min(range.end - 1, viewStart + Math.round(ratio * viewLength)));
    setScrubPosition(frame);
  };

  const endWaveformPointer = (pointerId: number) => {
    waveformPointers.current.delete(pointerId);
    if (waveformPointers.current.size === 0) setScrubPosition(null);
    if (scrubPointer.current === pointerId) scrubPointer.current = null;
    if (pinch.current?.ids.includes(pointerId)) pinch.current = null;
  };

  const marker = (edge: 'start' | 'end') => (
    <button
      type="button"
      aria-label={`${edge === 'start' ? 'Start' : 'End'} marker`}
      disabled={!pad.buffer}
      className={`slice-handle slice-handle-${edge}`}
      style={{ left: `clamp(22px, ${length ? (range[edge] - viewStart) * 100 / viewLength : 0}%, calc(100% - 22px))`, touchAction: 'none' }}
      onPointerDown={(event) => {
        if (drag.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const visible = Math.max(viewStart, Math.min(viewEnd, range[edge]));
        const origin = edge === 'start' ? Math.min(visible, range.end - 1) : Math.max(visible, range.start + 1);
        drag.current = { pointerId: event.pointerId, edge, range, original: range, x: event.clientX, origin };
      }}
      onPointerMove={moveMarker}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        moveMarker(event);
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
    <div ref={containerRef} className="sampler-waveform relative h-24 bg-zinc-950 border border-zinc-700 overflow-hidden shrink-0">
      <div className="waveform-gesture-surface absolute inset-0 touch-none"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          waveformPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (waveformPointers.current.size >= 2) {
            const [first, second] = [...waveformPointers.current.entries()].slice(-2);
            const bounds = containerRef.current?.getBoundingClientRect();
            if (!bounds || bounds.width <= 0) return;
            const distance = Math.hypot(first[1].x - second[1].x, first[1].y - second[1].y);
            const centerX = (first[1].x + second[1].x) / 2;
            const centerRatio = Math.max(0, Math.min(1, (centerX - bounds.left) / bounds.width));
            pinch.current = {
              ids: [first[0], second[0]], distance: Math.max(1, distance), zoom,
              centerFrame: viewStart + centerRatio * viewLength,
            };
            scrubPointer.current = null;
            setScrubPosition(null);
          } else {
            scrubPointer.current = event.pointerId;
            scrubAt(event.clientX);
          }
        }}
        onPointerMove={(event) => {
          if (!waveformPointers.current.has(event.pointerId)) return;
          waveformPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const gesture = pinch.current;
          if (gesture && gesture.ids.includes(event.pointerId)) {
            const first = waveformPointers.current.get(gesture.ids[0]);
            const second = waveformPointers.current.get(gesture.ids[1]);
            const bounds = containerRef.current?.getBoundingClientRect();
            if (!first || !second || !bounds || bounds.width <= 0) return;
            const distance = Math.hypot(first.x - second.x, first.y - second.y);
            const nextZoom = Math.max(1, Math.min(32, gesture.zoom * distance / gesture.distance));
            const centerX = (first.x + second.x) / 2;
            const ratio = Math.max(0, Math.min(1, (centerX - bounds.left) / bounds.width));
            const nextLength = Math.max(1, Math.ceil(length / nextZoom));
            const nextStart = Math.max(0, Math.min(length - nextLength, Math.round(gesture.centerFrame - ratio * nextLength)));
            setZoom(nextZoom);
            setPosition(length ? nextStart / length : 0);
            return;
          }
          if (scrubPointer.current !== event.pointerId) return;
          scrubAt(event.clientX);
        }}
        onPointerUp={(event) => endWaveformPointer(event.pointerId)}
        onPointerCancel={(event) => endWaveformPointer(event.pointerId)}
        onLostPointerCapture={(event) => endWaveformPointer(event.pointerId)}>
        {renderWaveform({
          isPlaying: waveformPlaying,
          playheadNorm,
          slicePoints: length ? { startNorm: range.start / length, endNorm: range.end / length } : undefined,
          sliceMarkers: sliceMarkerNorms,
          viewStartNorm: length ? viewStart / length : 0,
          viewEndNorm: length ? viewEnd / length : 1,
          height: 96,
          style: { height: '100%' },
          className: 'pointer-events-none border-0 rounded-none',
        })}
      </div>
      <div aria-hidden="true"
        style={scrubPosition !== null && scrubPosition >= viewStart && scrubPosition <= viewEnd
          ? { left: `${(scrubPosition - viewStart) * 100 / viewLength}%` }
          : { display: 'none' }}
        className="absolute top-0 bottom-0 w-px bg-white pointer-events-none z-[1]" />
      {!pad.buffer && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 text-[11px] pointer-events-none">
          <span className="text-zinc-400 font-bold">{pad.loading ? 'LOADING SAMPLE' : pad.sampleKey ? pad.name : 'NO SAMPLE LOADED'}</span>
          <span className="text-[9px] text-zinc-600">{pad.sampleKey ? 'TAP PAD TO LOAD' : 'WAVEFORM / SLICING GRID'}</span>
        </div>
      )}
      {pad.buffer && <>
        <div className="absolute top-0 inset-x-1 flex items-center justify-between gap-2 text-[9px] pointer-events-none">
          <span className="min-w-0 truncate text-cyan-300">{pad.name}</span>
          <span className="shrink-0 text-zinc-400" aria-label="Decoded audio format">
            {pad.buffer.sampleRate} Hz · {pad.buffer.numberOfChannels === 1 ? 'MONO' : pad.buffer.numberOfChannels === 2 ? 'STEREO' : `${pad.buffer.numberOfChannels} CH`} · {pad.buffer.duration.toFixed(2)}s · {zoom.toFixed(1)}×
          </span>
        </div>
        {marker('start')}
        {marker('end')}
        {zoom > 1.01 && <button type="button" className="wave-snap-view" aria-label="Snap trim to view" onClick={snapTrimToView}>
          SNAP VIEW
        </button>}
        <button type="button" className="wave-precision" onClick={() => { setPrecision(!precision); setError(null); }}>
          {precision ? 'DONE' : 'FRAMES'}
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
