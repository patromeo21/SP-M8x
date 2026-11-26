import React, { useEffect, useMemo, useRef } from 'react';
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
  audioBuffer: AudioBuffer | null;
  padId?: string;
  isPlaying?: boolean;
  playheadNorm?: number;
  slicePoints?: { startNorm: number; endNorm: number };
  sliceMarkers?: number[];
  viewStartNorm?: number;
  viewEndNorm?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  backgroundColor?: string;
  waveformColor?: string;
  accentColor?: string;
  onScrubNormalized?: (normPos: number) => void;
}

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  audioBuffer,
  isPlaying = false,
  playheadNorm = 0,
  slicePoints,
  sliceMarkers,
  viewStartNorm = 0,
  viewEndNorm = 1,
  height = 96,
  className = '',
  style,
  backgroundColor = '#09090b',
  waveformColor = '#38bdf8',
  accentColor = '#f59e0b',
  onScrubNormalized,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksCacheRef = useRef<Map<AudioBuffer, WaveformMipmapLevel[]>>(new Map());

  const layout = useMemo<WaveformCanvasLayout>(
    () => ({
      width: 300,
      height,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      viewStartNorm,
      viewEndNorm,
    }),
    [height, viewEndNorm, viewStartNorm],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
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
        slicePoints,
        sliceMarkers,
        viewStartNorm,
        viewEndNorm,
      });

      drawWaveformOverlay(currentContext, width, height, {
        isPlaying,
        playheadNorm,
        slicePoints,
        sliceMarkers,
        viewStartNorm,
        viewEndNorm,
        accentColor,
      });
    };

    const cleanup = startDemandGatedRender(renderFrame);
    return cleanup;
  }, [
    accentColor,
    audioBuffer,
    backgroundColor,
    height,
    isPlaying,
    layout.width,
    playheadNorm,
    sliceMarkers,
    slicePoints,
    viewEndNorm,
    viewStartNorm,
    waveformColor,
  ]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onScrubNormalized || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const norm = pointerXToNormalized(event.clientX, rect, viewStartNorm, viewEndNorm);
    onScrubNormalized(norm);
  };

  return (
    <div
      ref={hostRef}
      style={{ height, ...style }}
      className={`audio-waveform-canvas relative w-full overflow-hidden rounded border border-zinc-800 ${className}`}
      onPointerDown={handlePointerDown}
    />
  );
};

export default AudioWaveformCanvas;