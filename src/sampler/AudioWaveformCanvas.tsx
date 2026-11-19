import React, { useEffect, useRef, useState } from 'react';

export interface AudioWaveformCanvasProps {
  /** Audio buffer from the loaded sample */
  audioBuffer: AudioBuffer | null;
  /** Whether the transport is currently playing */
  isPlaying: boolean;
  /** Normalized playhead position (0.0 to 1.0) */
  playheadNorm: number;
  /** Optional slice points (startNorm, endNorm) in 0-1 range */
  slicePoints?: { startNorm: number; endNorm: number };
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
  onSliceChange,
  height = 128,
  viewStartNorm = 0,
  viewEndNorm = 1,
  className = '',
  style,
}) => {
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeSliceHandleRef = useRef<'start' | 'end' | null>(null);
  const [mipmaps, setMipmaps] = useState<{ [res: number]: { min: Float32Array; max: Float32Array } } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const playheadRef = useRef(playheadNorm);
  playheadRef.current = playheadNorm;
  const viewStart = Math.max(0, Math.min(1 - 1e-6, viewStartNorm));
  const viewEnd = Math.max(viewStart + 1e-6, Math.min(1, viewEndNorm));
  const sliceStart = slicePoints?.startNorm;
  const sliceEnd = slicePoints?.endNorm;

  const getPointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return 0;
    return Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
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
      setMipmaps(null);
      return;
    }
    setMipmaps(null);

    // Instantiate worker via Vite worker import syntax
    workerRef.current = new Worker(
      new URL('../workers/waveformWorker.ts', import.meta.url),
      { type: 'module' }
    );

    const channelData = audioBuffer.getChannelData(0);
    const channelDataCopy = channelData.slice();
    const workerId = Math.random().toString(36).substring(7);

    workerRef.current.onmessage = (e) => {
      if (e.data.id === workerId) {
        setMipmaps(e.data.mipmaps);
      }
    };

    workerRef.current.postMessage(
      { id: workerId, channelData: channelDataCopy },
      [channelDataCopy.buffer],
    );

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [audioBuffer]);

  // Reset dimensions on setup as well, so Strict Mode's effect replay restores the canvases.
  useEffect(() => {
    const canvases = [staticCanvasRef.current, overlayCanvasRef.current];
    for (const canvas of canvases) {
      if (canvas) {
        canvas.width = 600;
        canvas.height = height;
      }
    }

    return () => {
      for (const canvas of canvases) {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    };
  }, [height]);

  // 2. Render Static Waveform Layer (Layer 1 - Runs ONCE per load/zoom change)
  useEffect(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas || !mipmaps) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const width = canvas.width;
    const hHeight = canvas.height;
    const mid = hHeight / 2;

    // Clear background (M8 hardware theme chassis color)
    ctx.fillStyle = '#13171d';
    ctx.fillRect(0, 0, width, height);

    // Pick mipmap resolution closest to canvas width
    const targetRes = width <= 128 ? 64 : width <= 1024 ? 512 : 4096;
    const peakData = mipmaps[targetRes] || mipmaps[512];
    if (!peakData) return;

    ctx.strokeStyle = '#38bdf8'; // M8 Accent Cyan
    ctx.lineWidth = 1;
    ctx.beginPath();

    const firstBin = Math.min(peakData.min.length - 1, Math.floor(viewStart * peakData.min.length));
    const lastBin = Math.max(firstBin + 1, Math.min(peakData.min.length, Math.ceil(viewEnd * peakData.min.length)));
    const visibleBins = lastBin - firstBin;
    const step = width / visibleBins;
    for (let i = firstBin; i < lastBin; i++) {
      const x = (i - firstBin) * step;
      const yMin = mid + peakData.min[i] * mid * 0.85;
      const yMax = mid + peakData.max[i] * mid * 0.85;

      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    ctx.stroke();

  }, [mipmaps, height, viewStart, viewEnd]);

  // 3. Demand-Gated Overlay Layer (Layer 2 - RAF active ONLY during playback)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number | null = null;

    const renderOverlay = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (sliceStart !== undefined && sliceEnd !== undefined) {
        const range = viewEnd - viewStart;
        const visibleStart = Math.max(viewStart, sliceStart);
        const visibleEnd = Math.min(viewEnd, sliceEnd);
        const startX = (visibleStart - viewStart) / range * canvas.width;
        const endX = (visibleEnd - viewStart) / range * canvas.width;

        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        if (endX > startX) ctx.fillRect(startX, 0, endX - startX, canvas.height);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (sliceStart >= viewStart && sliceStart <= viewEnd) {
          ctx.moveTo(startX, 0);
          ctx.lineTo(startX, canvas.height);
        }
        if (sliceEnd >= viewStart && sliceEnd <= viewEnd) {
          ctx.moveTo(endX, 0);
          ctx.lineTo(endX, canvas.height);
        }
        ctx.stroke();
      }

      if (isPlaying) {
        const x = (playheadRef.current - viewStart) / (viewEnd - viewStart) * canvas.width;
        ctx.strokeStyle = '#38e58c'; // Phosphor Green Playhead
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      if (isPlaying) {
        animId = requestAnimationFrame(renderOverlay);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(renderOverlay);
    } else {
      renderOverlay();
    }

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
    };
  }, [isPlaying, sliceStart, sliceEnd, height, viewStart, viewEnd]);

  return (
    <div
      className={`relative w-full rounded border border-[#222832] bg-[#13171d] overflow-hidden ${className}`}
      style={{ ...style, height, touchAction: 'none' }}
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