import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { ADSR_BOUNDS, normalizeAdsrEnvelope, type AdsrEnvelope } from '../types';
import { percentFromFrame, rangeFromPercent, type SampleRange } from './sampleRange';
import { intermediateMarkerFrameAtPointer, markerRangeAtPointer } from './waveformGesture';
import type { PadBankApi, PadSlot, PadSlotPatch } from './usePadBank';
import type { AudioWaveformCanvasProps } from './AudioWaveformCanvas';

type MarkerDrag = {
  pointerId: number;
  kind: 'start' | 'end' | 'slice';
  range: SampleRange;
  original: SampleRange;
  originalMarkers: number[];
  markers: number[];
  markerIndex: number;
  x: number;
  origin: number;
  pendingX: number;
  frame: number | null;
};

type SliceMarkerPatch = PadSlotPatch & Pick<PadSlot, 'sliceMarkers'>;
type AdsrPadSlot = PadSlot & { adsr?: AdsrEnvelope };
type AdsrPadSlotPatch = PadSlotPatch & { adsr: AdsrEnvelope };

function getPadAdsr(pad: PadSlot): AdsrEnvelope {
  const adsrPad: AdsrPadSlot = pad;
  return normalizeAdsrEnvelope(adsrPad.adsr);
}

const ADSR_CONTROLS: readonly {
  key: keyof AdsrEnvelope;
  label: 'A' | 'D' | 'S' | 'R';
  title: string;
  min: number;
  max: number;
  step: number;
  value: (envelope: AdsrEnvelope) => number;
  display: (envelope: AdsrEnvelope) => string;
  parse: (value: number) => number;
}[] = [
  {
    key: 'attackMs', label: 'A', title: 'Attack (ms) — 0ms keeps raw transient',
    min: ADSR_BOUNDS.minAttackMs, max: ADSR_BOUNDS.maxAttackMs, step: 1,
    value: (envelope) => envelope.attackMs, display: (envelope) => `${Math.round(envelope.attackMs)}ms`,
    parse: (value) => value,
  },
  {
    key: 'decayMs', label: 'D', title: 'Decay (ms) to sustain',
    min: ADSR_BOUNDS.minDecayMs, max: ADSR_BOUNDS.maxDecayMs, step: 5,
    value: (envelope) => envelope.decayMs, display: (envelope) => `${Math.round(envelope.decayMs)}ms`,
    parse: (value) => value,
  },
  {
    key: 'sustain', label: 'S', title: 'Sustain level (%)',
    min: 0, max: 100, step: 1,
    value: (envelope) => Math.round(envelope.sustain * 100),
    display: (envelope) => `${Math.round(envelope.sustain * 100)}%`,
    parse: (value) => value / 100,
  },
  {
    key: 'releaseMs', label: 'R', title: 'Release (ms) on gate/stop',
    min: ADSR_BOUNDS.minReleaseMs, max: ADSR_BOUNDS.maxReleaseMs, step: 1,
    value: (envelope) => envelope.releaseMs, display: (envelope) => `${Math.round(envelope.releaseMs)}ms`,
    parse: (value) => value,
  },
];

interface Props {
  pad: PadSlot;
  onUpdatePad: PadBankApi['updatePad'];
  onPreviewRange: PadBankApi['previewRange'];
  sliceCount: number;
  onSnapActionChange: (action: (() => void) | null) => void;
  renderWaveform: (props: Omit<AudioWaveformCanvasProps, 'audioBuffer'>) => React.ReactNode;
}

export const WaveformEditor: React.FC<Props> = ({
  pad, onUpdatePad, onPreviewRange, sliceCount, onSnapActionChange, renderWaveform,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<MarkerDrag | null>(null);
  const waveformPointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ ids: [number, number]; distance: number; zoom: number; centerFrame: number } | null>(null);
  const scrubPointer = useRef<number | null>(null);
  const [preview, setPreview] = useState<SampleRange | null>(null);
  const [sliceMarkerPreview, setSliceMarkerPreview] = useState<number[] | null>(null);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [precision, setPrecision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waveformPlaying, setWaveformPlaying] = useState(false);
  const [playheadNorm, setPlayheadNorm] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState(0);
  const [adsr, setAdsr] = useState<AdsrEnvelope>(() => getPadAdsr(pad));
  const length = pad.buffer?.length ?? 0;
  const viewLength = Math.max(1, Math.ceil(length / zoom));
  const viewStart = Math.max(0, Math.min(length - viewLength, Math.round(position * length)));
  const viewEnd = Math.min(length, viewStart + viewLength);
  const range = preview ?? (length ? rangeFromPercent(pad.startPct, pad.endPct, length) : { start: 0, end: 0 });
  const sliceMarkerFrames = useMemo(() => {
    if (sliceMarkerPreview) return sliceMarkerPreview;
    if (sliceCount > 0) {
      const saved = pad.sliceMarkers;
      if (saved.length === sliceCount + 1 && saved[0] === range.start && saved[saved.length - 1] === range.end) {
        return saved.slice(1, -1);
      }
      return Array.from({ length: sliceCount - 1 }, (_, index) =>
        range.start + Math.floor((index + 1) * (range.end - range.start) / sliceCount));
    }
    return pad.sliceMarkers.slice(1, -1);
  }, [sliceCount, range.start, range.end, pad.sliceMarkers, sliceMarkerPreview]);
  const sliceMarkerBoundaries = useMemo(() => {
    if (sliceMarkerPreview) return [range.start, ...sliceMarkerPreview, range.end];
    if (sliceCount > 0 && pad.sliceMarkers.length === sliceCount + 1 &&
        pad.sliceMarkers[0] === range.start && pad.sliceMarkers[pad.sliceMarkers.length - 1] === range.end) {
      return [...pad.sliceMarkers];
    }
    if (sliceCount === 0 && pad.sliceMarkers.length >= 2) return [...pad.sliceMarkers];
    return [range.start, ...sliceMarkerFrames, range.end];
  }, [sliceCount, range.start, range.end, pad.sliceMarkers, sliceMarkerFrames, sliceMarkerPreview]);
  const sliceMarkerNorms = useMemo(() => length ? sliceMarkerFrames.map((frame) => frame / length) : [],
    [sliceMarkerFrames, length]);

  useEffect(() => {
    setAdsr(getPadAdsr(pad));
    audioEngine.setPadAdsr(pad.id, getPadAdsr(pad));
  }, [pad]);

  const changeAdsr = (key: keyof AdsrEnvelope, value: number, parse: (value: number) => number) => {
    const next = normalizeAdsrEnvelope({ ...adsr, [key]: parse(value) });
    setAdsr(next);
    const patch: AdsrPadSlotPatch = { adsr: next };
    onUpdatePad(pad.id, patch);
    audioEngine.setPadAdsr(pad.id, next);
  };

  useEffect(() => {
    if (drag.current?.frame !== null && drag.current?.frame !== undefined) cancelAnimationFrame(drag.current.frame);
    drag.current = null;
    setPreview(null);
    setSliceMarkerPreview(null);
    setPrecision(false);
    setError(null);
    setZoom(1);
    setPosition(0);
    return () => {
      const active = drag.current;
      if (active?.frame !== null && active?.frame !== undefined) cancelAnimationFrame(active.frame);
      if (active && active.kind !== 'slice' && length) {
        onPreviewRange(pad.id, percentFromFrame(active.original.start, length), percentFromFrame(active.original.end, length));
      }
      drag.current = null;
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

  const snapTrimToView = useCallback(() => {
    if (!length || viewEnd <= viewStart) return;
    const next = { start: viewStart, end: viewEnd };
    setPreview(null);
    onUpdatePad(pad.id, {
      startPct: percentFromFrame(next.start, length),
      endPct: percentFromFrame(next.end, length),
    });
  }, [length, onUpdatePad, pad.id, viewEnd, viewStart]);

  useEffect(() => {
    onSnapActionChange(zoom > 1.01 && length > 0 ? snapTrimToView : null);
  }, [length, onSnapActionChange, snapTrimToView, zoom]);

  useEffect(() => () => onSnapActionChange(null), [onSnapActionChange]);

  const applyMarkerPosition = (active: MarkerDrag, clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || !length) return;
    if (active.kind === 'slice') {
      const index = active.markerIndex;
      const next = [...active.originalMarkers];
      next[index] = intermediateMarkerFrameAtPointer(
        {
          start: active.originalMarkers[index - 1],
          end: active.originalMarkers[index + 1],
        },
        active.origin,
        active.x,
        clientX,
        viewStart,
        viewEnd,
        viewLength,
        bounds.width,
        length,
      );
      active.markers = next;
      setSliceMarkerPreview(next.slice(1, -1));
      return;
    }
    const next = markerRangeAtPointer(active.original, active.kind, active.origin, active.x, clientX, viewLength, bounds.width, length);
    active.range = next;
    setPreview(next);
    onPreviewRange(pad.id, percentFromFrame(next.start, length), percentFromFrame(next.end, length));
  };

  const moveMarker = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.pendingX = event.clientX;
    if (active.frame !== null) return;
    active.frame = requestAnimationFrame(() => {
      if (drag.current !== active) return;
      active.frame = null;
      applyMarkerPosition(active, active.pendingX);
    });
  };

  const finishMarker = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.frame !== null) cancelAnimationFrame(active.frame);
    active.frame = null;
    applyMarkerPosition(active, event.clientX);
    drag.current = null;
    if (active.kind === 'slice') {
      setSliceMarkerPreview(null);
      const patch: SliceMarkerPatch = { sliceMarkers: active.markers };
      onUpdatePad(pad.id, patch);
    } else {
      setPreview(null);
      commitRange(active.range);
    }
  };

  const cancelMarker = (pointerId: number) => {
    const active = drag.current;
    if (!active || active.pointerId !== pointerId) return;
    if (active.frame !== null) cancelAnimationFrame(active.frame);
    drag.current = null;
    if (active.kind === 'slice') {
      setSliceMarkerPreview(null);
    } else {
      setPreview(null);
      onPreviewRange(pad.id, percentFromFrame(active.original.start, length), percentFromFrame(active.original.end, length));
    }
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

  const startMarkerDrag = (event: React.PointerEvent<HTMLButtonElement>, kind: MarkerDrag['kind'], markerIndex = 0) => {
    if (drag.current || waveformPointers.current.size > 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (kind === 'slice') {
      const origin = sliceMarkerBoundaries[markerIndex];
      drag.current = {
        pointerId: event.pointerId, kind, range, original: range,
        originalMarkers: sliceMarkerBoundaries, markers: sliceMarkerBoundaries,
        markerIndex, x: event.clientX, origin, pendingX: event.clientX, frame: null,
      };
      return;
    }
    const edge = kind;
    const visible = Math.max(viewStart, Math.min(viewEnd, range[edge]));
    const origin = edge === 'start' ? Math.min(visible, range.end - 1) : Math.max(visible, range.start + 1);
    drag.current = {
      pointerId: event.pointerId, kind, range, original: range,
      originalMarkers: [], markers: [], markerIndex: 0,
      x: event.clientX, origin, pendingX: event.clientX, frame: null,
    };
  };

  const marker = (edge: 'start' | 'end') => (
    <button
      type="button"
      aria-label={`${edge === 'start' ? 'Start' : 'End'} marker`}
      disabled={!pad.buffer}
      className={`slice-handle slice-handle-${edge}`}
      style={{ left: `clamp(22px, ${length ? (range[edge] - viewStart) * 100 / viewLength : 0}%, calc(100% - 22px))`, touchAction: 'none' }}
      onPointerDown={(event) => startMarkerDrag(event, edge)}
      onPointerMove={moveMarker}
      onPointerUp={finishMarker}
      onPointerCancel={(event) => cancelMarker(event.pointerId)}
      onLostPointerCapture={(event) => cancelMarker(event.pointerId)}
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

  const sliceMarkerHandle = (frame: number, index: number) => (
    <button
      key={`slice-marker-${index}`}
      type="button"
      aria-label={`Slice marker ${index + 1}`}
      disabled={!pad.buffer}
      className="slice-handle slice-handle-intermediate"
      style={{ left: `${(frame - viewStart) * 100 / viewLength}%`, touchAction: 'none' }}
      onPointerDown={(event) => startMarkerDrag(event, 'slice', index + 1)}
      onPointerMove={moveMarker}
      onPointerUp={finishMarker}
      onPointerCancel={(event) => cancelMarker(event.pointerId)}
      onLostPointerCapture={(event) => cancelMarker(event.pointerId)}
    />
  );

  return (
    <>
    <div ref={containerRef} className="sampler-waveform relative h-24 bg-zinc-950 border border-zinc-700 overflow-hidden shrink-0">
      <div className="waveform-gesture-surface absolute inset-0 touch-none"
        onPointerDown={(event) => {
          if (drag.current) return;
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
        {sliceMarkerFrames.map((frame, index) => {
          const visible = frame >= viewStart && frame <= viewEnd;
          const active = drag.current?.kind === 'slice' && drag.current.markerIndex === index + 1;
          return visible || active ? sliceMarkerHandle(frame, index) : null;
        })}
        {marker('end')}
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
    <div
      className="waveform-adsr"
      role="group"
      aria-label="Hardware ADSR Envelope"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '6px',
        alignItems: 'center',
        flex: '0 0 auto',
      }}
    >
      {ADSR_CONTROLS.map((control) => (
        <label key={control.key} title={control.title} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, lineHeight: 1.1 }}>
            <span>{control.label}</span>
            <span>{control.display(adsr)}</span>
          </span>
          <input
            type="range"
            aria-label={`ADSR ${control.title}`}
            min={control.min}
            max={control.max}
            step={control.step}
            value={control.value(adsr)}
            onChange={(event) => changeAdsr(control.key, Number(event.target.value), control.parse)}
            style={{ width: '100%', minHeight: '32px', margin: 0, touchAction: 'pan-x' }}
          />
        </label>
      ))}
    </div>
    </>
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
