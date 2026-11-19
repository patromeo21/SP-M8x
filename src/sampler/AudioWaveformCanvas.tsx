import React, { useEffect, useRef, useState } from 'react';
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

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  audioBuffer,
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
  const sliceStart = slicePoints?.startNorm;
  const sliceEnd = slicePoints?.endNorm;

  const getPointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return pointerXToNormalized(event.clientX, bounds.left, bounds.width, viewStart, viewEnd);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!slicePoints || !onSliceChange || event.button !== 0) return;
    const position = getPointerPosition(event);
    activeSliceHandleRef.current =
      Math.abs(position - slicePoints.startNorm) <= Math.abs(position - slicePoints.endNorm) ? 'start' : 'end';
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = activeSliceHandleRef.current;
    if (!handle || !slicePoints || !onSliceChange) return;
    const position = getPointerPosition(event);
    if (handle === 'start') {
      onSliceChange(Math.min(position, slicePoints.endNorm), slicePoints.endNorm);
    } else {
      onSliceChange(slicePoints.startNorm, Math.max(position, slicePoints.startNorm));
    }
  };

  const handlePointerUp = () => {
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
      drawWaveformOverlay(
        context,
        canvas.width,
        canvas.height,
        viewStart,
        viewEnd,
        sliceStart,
        sliceEnd,
        sliceMarkers,
        isPlaying ? playheadRef.current : null,
      );
    };
    const renderOverlay = () => layer.render(drawOverlay);

    return startDemandGatedRender(renderOverlay, isPlaying);
  }, [isPlaying, sliceStart, sliceEnd, sliceMarkers, height, viewStart, viewEnd]);

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