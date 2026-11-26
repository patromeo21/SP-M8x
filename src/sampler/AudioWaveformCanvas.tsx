import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createWaveformCanvas,
  drawStaticWaveform,
  drawWaveformOverlay,
  pointerXToNormalized,
  releaseWaveformResources,
  startDemandGatedRender,
  type Waveform2DContext,
  type WaveformCanvasLayout,
  type WaveformMipmapLevel,
} from './waveformCanvasRendering';

export interface AudioWaveformCanvasProps {
  /** Audio buffer from the loaded sample */
  audioBuffer: AudioBuffer | null;
  /** Optional pad ID to poll live playback position if available */
  padId?: string;
  /** Whether the transport is currently playing */
  isPlaying?: boolean;
  /** Normalized playhead position (0.0 to 1.0) */
  playheadNorm?: number;
  /** Optional slice points (startNorm, endNorm) in 0-1 range */
  slicePoints?: { startNorm: number; endNorm: number };
  /** Optional normalized positions for interior slice markers */
  sliceMarkers?: readonly number[];
  /** Callback when slice points change via drag */
  onSliceChange?: (startNorm: number, endNorm: number) => void;
  /** Callback when a slice start marker is dragged */
  onSliceStartChange?: (startNorm: number, markerIndex?: number) => void;
  /** Callback when scrubbing/seeking to a normalized position */
  onScrubNormalized?: (normPos: number) => void;
  /** Canvas height in pixels */
  height?: number;
  viewStartNorm?: number;
  viewEndNorm?: number;
  className?: string;
  style?: React.CSSProperties;
  backgroundColor?: string;
  waveformColor?: string;
  accentColor?: string;
}

const clampNorm = (value: number): number => Math.max(0, Math.min(1, value));

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  audioBuffer,
  isPlaying = false,
  playheadNorm = 0,
  slicePoints,
  sliceMarkers,
  onSliceChange,
  onSliceStartChange,
  onScrubNormalized,
  height = 96,
  viewStartNorm = 0,
  viewEndNorm = 1,
  className = '',
  style,
  backgroundColor = '#09090b',
  waveformColor = '#38bdf8',
  accentColor = '#f59e0b',
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksCacheRef = useRef>(new Map());
  const activeDragRef = useRef<{
    pointerId: number;
    kind: 'start' | 'end' | 'sliceStart';
    markerIndex: number;
    startNorm: number;
    endNorm: number;
    markers: number[];
  } | null>(null);

  const [dragStartNorm, setDragStartNorm] = useState<number | null>(null);
  const [dragEndNorm, setDragEndNorm] = useState<number | null>(null);
  const [dragMarkers, setDragMarkers] = useState<number[] | null>(null);

  const safeViewStart = Math.max(0, Math.min(1 - 1e-6, viewStartNorm));
  const safeViewEnd = Math.max(safeViewStart + 1e-6, Math.min(1, viewEndNorm));
  const viewSpan = Math.max(1e-6, safeViewEnd - safeViewStart);

  const effectiveStartNorm =
    dragStartNorm ??
    (slicePoints ? clampNorm(Math.min(slicePoints.startNorm, slicePoints.endNorm)) : undefined);
  const effectiveEndNorm =
    dragEndNorm ??
    (slicePoints ? clampNorm(Math.max(slicePoints.startNorm, slicePoints.endNorm)) : undefined);
  const effectiveMarkers = dragMarkers ?? (sliceMarkers ? [...sliceMarkers] : []);

  const layout = useMemo<WaveformCanvasLayout>(
    () => ({
      width: 300,
      height,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      viewStartNorm: safeViewStart,
      viewEndNorm: safeViewEnd,
    }),
    [height, safeViewEnd, safeViewStart],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || host.clientWidth || layout.width));
    const canvas = createWaveformCanvas(width, height, dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    host.innerHTML = '';
    host.appendChild(canvas);
    canvasRef.current = canvas;

    return () => {
      releaseWaveformResources(canvas);
      if (canvasRef.current === canvas) {
        canvasRef.current = null;
      }
    };
  }, [height, layout.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context: Waveform2DContext | null = canvas.getContext('2d');
    if (!context) return;

    const activeSlicePoints =
      effectiveStartNorm !== undefined && effectiveEndNorm !== undefined
        ? { startNorm: effectiveStartNorm, endNorm: effectiveEndNorm }
        : slicePoints;

    const renderFrame = () => {
      const currentCanvas = canvasRef.current;
      const currentContext: Waveform2DContext | null = currentCanvas?.getContext('2d') ?? null;
      if (!currentCanvas || !currentContext) return;

      const rect = currentCanvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width || currentCanvas.clientWidth || layout.width));

      drawStaticWaveform({
        canvas: currentCanvas,
        ctx: currentContext,
        audioBuffer,
        peaksCache: peaksCacheRef.current,
        height,
        backgroundColor,
        waveformColor,
        accentColor,
        isPlaying,
        playheadNorm,
        slicePoints: activeSlicePoints,
        sliceMarkers: effectiveMarkers,
        viewStartNorm: safeViewStart,
        viewEndNorm: safeViewEnd,
      });

      drawWaveformOverlay(currentContext, width, height, {
        isPlaying,
        playheadNorm,
        slicePoints: activeSlicePoints,
        sliceMarkers: effectiveMarkers,
        viewStartNorm: safeViewStart,
        viewEndNorm: safeViewEnd,
        accentColor,
      });
    };

    const cleanup = startDemandGatedRender(renderFrame);
    return cleanup;
  }, [
    accentColor,
    audioBuffer,
    backgroundColor,
    effectiveEndNorm,
    effectiveMarkers,
    effectiveStartNorm,
    height,
    isPlaying,
    layout.width,
    playheadNorm,
    safeViewEnd,
    safeViewStart,
    slicePoints,
    waveformColor,
  ]);

  const pointerToNorm = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? hostRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return safeViewStart;
    return clampNorm(
      pointerXToNormalized(clientX, rect, safeViewStart, safeViewEnd),
    );
  };

  const beginHandleDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    kind: 'start' | 'end' | 'sliceStart',
    markerIndex = -1,
  ) => {
    if (!audioBuffer) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startVal = effectiveStartNorm ?? 0;
    const endVal = effectiveEndNorm ?? 1;
    const markersCopy = [...effectiveMarkers];

    activeDragRef.current = {
      pointerId: event.pointerId,
      kind,
      markerIndex,
      startNorm: startVal,
      endNorm: endVal,
      markers: markersCopy,
    };
  };

  const updateHandleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = activeDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const nextNorm = pointerToNorm(event.clientX);

    if (active.kind === 'start') {
      const clampedStart = Math.max(0, Math.min(nextNorm, active.endNorm - 1e-4));
      active.startNorm = clampedStart;
      setDragStartNorm(clampedStart);
      setDragEndNorm(active.endNorm);
    } else if (active.kind === 'end') {
      const clampedEnd = Math.max(active.startNorm + 1e-4, Math.min(1, nextNorm));
      active.endNorm = clampedEnd;
      setDragStartNorm(active.startNorm);
      setDragEndNorm(clampedEnd);
    } else if (active.kind === 'sliceStart' && active.markerIndex >= 0) {
      const prevBound = active.markerIndex === 0 ? active.startNorm : active.markers[active.markerIndex - 1];
      const nextBound =
        active.markerIndex === active.markers.length - 1
          ? active.endNorm
          : active.markers[active.markerIndex + 1];
      const clampedMarker = Math.max(prevBound + 1e-4, Math.min(nextBound - 1e-4, nextNorm));
      const nextMarkers = [...active.markers];
      nextMarkers[active.markerIndex] = clampedMarker;
      active.markers = nextMarkers;
      setDragMarkers(nextMarkers);
    }
  };

  const commitHandleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = activeDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    updateHandleDrag(event);
    activeDragRef.current = null;

    if (active.kind === 'start' || active.kind === 'end') {
      setDragStartNorm(null);
      setDragEndNorm(null);
      onSliceChange?.(active.startNorm, active.endNorm);
    } else if (active.kind === 'sliceStart') {
      const finalVal = active.markers[active.markerIndex];
      setDragMarkers(null);
      if (finalVal !== undefined) {
        onSliceStartChange?.(finalVal, active.markerIndex);
      }
    }
  };

  const cancelHandleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!activeDragRef.current || activeDragRef.current.pointerId !== event.pointerId) return;
    activeDragRef.current = null;
    setDragStartNorm(null);
    setDragEndNorm(null);
    setDragMarkers(null);
  };

  const handleSurfacePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeDragRef.current || !onScrubNormalized) return;
    const norm = pointerToNorm(event.clientX);
    onScrubNormalized(norm);
  };

  const toViewPercent = (normPos: number): number => {
    return ((clampNorm(normPos) - safeViewStart) / viewSpan) * 100;
  };

  return (
    <div
      style={{ height, ...style }}
      className={`audio-waveform-canvas relative w-full select-none overflow-hidden rounded border border-zinc-800 bg-zinc-950 ${className}`}
      onPointerDown={handleSurfacePointerDown}
    >
      <div ref={hostRef} className="w-full h-full pointer-events-none" />

      {effectiveStartNorm !== undefined && (
        <button
          type="button"
          aria-label="Slice start marker"
          disabled={!audioBuffer}
          style={{ left: `${toViewPercent(effectiveStartNorm)}%`, touchAction: 'none' }}
          className="waveform-slice-start-handle absolute top-0 bottom-0 -translate-x-1/2 z-10 w-3.5 flex items-start justify-center bg-amber-400/20 hover:bg-amber-400/35 border-l-2 border-amber-400 cursor-ew-resize disabled:opacity-40"
          onPointerDown={(e) => beginHandleDrag(e, 'start')}
          onPointerMove={updateHandleDrag}
          onPointerUp={commitHandleDrag}
          onPointerCancel={cancelHandleDrag}
          onLostPointerCapture={cancelHandleDrag}
        >
          <span className="mt-0.5 px-0.5 text-[9px] font-mono font-bold leading-none bg-amber-400 text-zinc-950 rounded-xs">
            S
          </span>
        </button>
      )}

      {effectiveMarkers.map((markerNorm, idx) => {
        if (markerNorm < safeViewStart || markerNorm > safeViewEnd) return null;
        return (
          <button
            key={`slice-start-${idx}`}
            type="button"
            aria-label={`Slice start ${idx + 1}`}
            disabled={!audioBuffer}
            style={{ left: `${toViewPercent(markerNorm)}%`, touchAction: 'none' }}
            className="waveform-slice-marker-handle absolute top-0 bottom-0 -translate-x-1/2 z-10 w-2.5 flex items-end justify-center border-l border-cyan-300 bg-cyan-400/15 hover:bg-cyan-400/30 cursor-ew-resize disabled:opacity-40"
            onPointerDown={(e) => beginHandleDrag(e, 'sliceStart', idx)}
            onPointerMove={updateHandleDrag}
            onPointerUp={commitHandleDrag}
            onPointerCancel={cancelHandleDrag}
            onLostPointerCapture={cancelHandleDrag}
          >
            <span className="mb-0.5 px-0.5 text-[8px] font-mono font-bold leading-none bg-cyan-300 text-zinc-950 rounded-xs">
              {idx + 1}
            </span>
          </button>
        );
      })}

      {effectiveEndNorm !== undefined && (
        <button
          type="button"
          aria-label="Slice end marker"
          disabled={!audioBuffer}
          style={{ left: `${toViewPercent(effectiveEndNorm)}%`, touchAction: 'none' }}
          className="waveform-slice-end-handle absolute top-0 bottom-0 -translate-x-1/2 z-10 w-2 border-r-2 border-rose-400 bg-rose-400/10 pointer-events-none"
        />
      )}
    </div>
  );
};

export default AudioWaveformCanvas;