/**
 * SP-M8x Hybrid Music Production Suite
 * useAudioVisualizer.ts — React Hook for Canvas Visualizer Binding
 */

import { useEffect, useRef } from 'react';
import { audioVisualizerService } from './AudioVisualizerService';

export function useAudioVisualizer(analyser: AnalyserNode | null) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    audioVisualizerService.attach(canvas, analyser);
    audioVisualizerService.start();

    return () => {
      audioVisualizerService.stop();
      audioVisualizerService.detach();
    };
  }, [analyser]);

  return { canvasRef };
}