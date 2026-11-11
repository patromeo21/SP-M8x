/**
 * SP-M8x Hybrid Music Production Suite
 * useAudioVisualizer.ts — React Hook for Audio Visualizer Service Lifecycle
 */

import { useEffect, useRef, useCallback } from 'react';
import { AudioVisualizerService } from './AudioVisualizerService';

interface UseAudioVisualizerProps {
  analyser: AnalyserNode | null;
  mode?: 'waveform' | 'frequency';
  lineColor?: string;
  backgroundColor?: string;
  targetFps?: number; // Supports up to 120fps on high-refresh mobile/iPad displays
}

export function useAudioVisualizer({
  analyser,
  mode = 'waveform',
  lineColor,
  backgroundColor,
  targetFps,
}: UseAudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const serviceRef = useRef<AudioVisualizerService | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    // Instantiate visualizer service
    const service = new AudioVisualizerService({
      canvas,
      analyser,
      mode,
      lineColor,
      backgroundColor,
      targetFps,
    });

    serviceRef.current = service;
    service.start();

    // Cleanup on unmount or dependency change
    return () => {
      service.stop();
      serviceRef.current = null;
    };
  }, [analyser, mode, lineColor, backgroundColor, targetFps]);

  /**
   * Dynamically switch between waveform and frequency spectrum modes.
   */
  const setMode = useCallback((newMode: 'waveform' | 'frequency') => {
    serviceRef.current?.setMode(newMode);
  }, []);

  /**
   * Manually start visualization loop.
   */
  const start = useCallback(() => {
    serviceRef.current?.start();
  }, []);

  /**
   * Manually stop visualization loop.
   */
  const stop = useCallback(() => {
    serviceRef.current?.stop();
  }, []);

  return {
    canvasRef,
    setMode,
    start,
    stop,
  };
}
