import React, { useEffect, useRef, useState } from 'react';
import { schedulePsModulation } from '../audio/audioEngine';
import {
  createWaveformCanvasLayer,
  drawStaticWaveform,
  drawWaveformOverlay,
  pointerXToNormalized,
  releaseWaveformResources,
  startDemandGatedRender,
  type WaveformCanvasLayer,
  type Waveform2DContext,
  type WaveformMipmapLevels,
} from './waveformCanvasRendering';

export interface AudioWaveformCanvasProps {
  /** Audio buffer from the loaded sample */
  audioBuffer: AudioBuffer | null;
  /** Optional pad ID to poll live playback position if available */
  padId?: string;
  /** Whether the transport is currently playing */
  isPlaying: boolean;
  /** Normalized playhead position (0.0 to 1.0) */
  playheadNorm: number;
  /** Optional slice points (startNorm, endNorm) in 0-1 range */
  slicePoints?: { startNorm: number; endNorm: number };
  /** Optional normalized positions for interior slice markers */
  sliceMarkers?: readonly number[];
  /** Callback when slice points change via drag */
  onSliceChange?: (startNorm: number, endNorm: number) => void;
  /** Canvas height in pixels */
  height?: number;
  viewStartNorm?: number;
  viewEndNorm?: number;
  className?: string;
  style?: React.CSSProperties;
}

const clampNorm = (value: number): number => Math.max(0, Math.min(1, value));

type PlaybackPositionProvider = {
  getPadPlaybackPosition?: (padId: string, buffer: AudioBuffer) => number | null;
};

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  audioBuffer,
  padId,
  isPlaying,
  playheadNorm,
  slicePoints,
  sliceMarkers,
  onSliceChange,
  height = 128,
  viewStartNorm = 0,
  viewEndNorm = 1,
  className = '',
  style,
}) => {
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticLayerRef = useRef<WaveformCanvasLayer | null>(null);
  const overlayLayerRef = useRef<WaveformCanvasLayer | null>(null);
  const activeSliceHandleRef = useRef<'start' | 'end' | null>(null);
  const [mipmapResult, setMipmapResult] = useState<{ buffer: AudioBuffer; mipmaps: WaveformMipmapLevels } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const playheadRef = useRef(playheadNorm);
  playheadRef.current = playheadNorm;
  const mipmaps = mipmapResult?.buffer === audioBuffer ? mipmapResult.mipmaps : null;
  const viewStart = Math.max(0, Math.min(1 - 1e-6, viewStartNorm));
  const viewEnd = Math.max(viewStart + 1e-6, Math.min(1, viewEndNorm));
  const sliceStart = slicePoints ? clampNorm(Math.min(slicePoints.startNorm, slicePoints.endNorm)) : undefined;
  const sliceEnd = slicePoints ? clampNorm(Math.max(slicePoints.startNorm, slicePoints.endNorm)) : undefined;

  const getPointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clampNorm(pointerXToNormalized(event.clientX, bounds.left, bounds.width, viewStart, viewEnd));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sliceStart === undefined || sliceEnd === undefined || !onSliceChange || event.button !== 0) return;
    const position = getPointerPosition(event);
    activeSliceHandleRef.current =
      Math.abs(position - sliceStart) <= Math.abs(position - sliceEnd) ? 'start' : 'end';
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = activeSliceHandleRef.current;
    if (!handle || sliceStart === undefined || sliceEnd === undefined || !onSliceChange) return;
    const position = getPointerPosition(event);
    if (handle === 'start') {
      const nextStart = Math.min(position, sliceEnd);
      onSliceChange(nextStart, sliceEnd);
    } else {
      const nextEnd = Math.max(position, sliceStart);
      onSliceChange(sliceStart, nextEnd);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeSliceHandleRef.current = null;
  };

  // 1. Initialize Worker & Compute Mipmaps on Buffer Load
  useEffect(() => {
    if (!audioBuffer) {
      setMipmapResult(null);
      return;
    }
    setMipmapResult(null);

    // Instantiate worker via Vite worker import syntax
    const worker = new Worker(
      new URL('../workers/waveformWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index).slice());
    const workerId = Math.random().toString(36).substring(7);

    worker.onmessage = (e: MessageEvent<{ id: string; mipmaps: WaveformMipmapLevels }>) => {
      if (e.data.id === workerId) {
        setMipmapResult({ buffer: audioBuffer, mipmaps: e.data.mipmaps });
      }
    };

    worker.postMessage({ id: workerId, channels }, channels.map((channel) => channel.buffer));

    return () => {
      releaseWaveformResources([], [], worker);
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [audioBuffer]);

  // Reset dimensions on setup as well, so Strict Mode's effect replay restores the canvases.
  useEffect(() => {
    const staticCanvas = staticCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const canvases = [staticCanvas, overlayCanvas];
    for (const canvas of canvases) {
      if (canvas) {
        canvas.width = 600;
        canvas.height = height;
      }
    }
    const staticLayer = staticCanvas ? createWaveformCanvasLayer(staticCanvas, false) : null;
    const overlayLayer = overlayCanvas ? createWaveformCanvasLayer(overlayCanvas, true) : null;
    staticLayerRef.current = staticLayer;
    overlayLayerRef.current = overlayLayer;

    return () => {
      releaseWaveformResources(canvases, [staticLayer, overlayLayer]);
      if (staticLayerRef.current === staticLayer) staticLayerRef.current = null;
      if (overlayLayerRef.current === overlayLayer) overlayLayerRef.current = null;
    };
  }, [height]);

  // 2. Render Static Waveform Layer (Layer 1 - Runs ONCE per load/zoom change)
  useEffect(() => {
    const canvas = staticCanvasRef.current;
    const layer = staticLayerRef.current;
    if (!canvas || !layer) return;

    layer.render((context) => {
      drawStaticWaveform(context, canvas.width, canvas.height, mipmaps, viewStart, viewEnd);
    });
  }, [mipmaps, height, viewStart, viewEnd]);

  // 3. Demand-Gated Overlay Layer (Layer 2 - RAF active ONLY during playback)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const layer = overlayLayerRef.current;
    if (!canvas || !layer) return;

    const drawOverlay = (context: Waveform2DContext) => {
      let livePlayhead = isPlaying ? playheadRef.current : null;
      if (isPlaying && padId && audioBuffer && audioBuffer.duration > 0) {
        const provider = schedulePsModulation as unknown as PlaybackPositionProvider;
        const liveSeconds = provider.getPadPlaybackPosition?.(padId, audioBuffer) ?? null;
        if (liveSeconds !== null) {
          livePlayhead = clampNorm(liveSeconds / audioBuffer.duration);
        }
      }
      drawWaveformOverlay(
        context,
        canvas.width,
        canvas.height,
        viewStart,
        viewEnd,
        sliceStart,
        sliceEnd,
        sliceMarkers,
        livePlayhead,
      );
    };
    const renderOverlay = () => layer.render(drawOverlay);

    return startDemandGatedRender(renderOverlay, isPlaying);
  }, [audioBuffer, padId, isPlaying, sliceStart, sliceEnd, sliceMarkers, height, viewStart, viewEnd]);

  return (
    <div
      className={`relative w-full rounded border border-[#222832] bg-[#13171d] overflow-hidden ${className}`}
      style={{ height, ...style, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Layer 1: Static Waveform */}
      <canvas
        ref={staticCanvasRef}
        width={600}
        height={height}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      {/* Layer 2: Demand-Gated Playhead & Overlays */}
      <canvas
        ref={overlayCanvasRef}
        width={600}
        height={height}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </div>
  );
};