/**
 * SP-M8x Hybrid Music Production Suite
 * useLivePhraseRecorder.ts — React Hook for Live Pad Performance Capture & Quantization
 */

import { useState, useRef, useCallback } from 'react';
import { PhraseRecorder, type RecordedEvent } from './phraseRecorder';
import { projectController } from '../project/projectController';
import { selectPatternById } from '../project/trackerSelectors';

export function useLivePhraseRecorder(patternId: string, bpm: number) {
  const [isRecording, setIsRecording] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  
  const eventsRef = useRef<RecordedEvent[]>([]);
  const startTimeRef = useRef<number>(0);

  /**
   * Starts a live phrase recording session.
   */
  const startRecording = useCallback(() => {
    eventsRef.current = [];
    startTimeRef.current = performance.now();
    setIsRecording(true);
    setEventCount(0);
  }, []);

  /**
   * Records a tactile pad trigger with precise relative timestamp.
   */
  const recordHit = useCallback((event: Omit<RecordedEvent, 'timestampMs'>) => {
    if (!isRecording) return;
    const timestampMs = performance.now() - startTimeRef.current;
    
    eventsRef.current.push({
      ...event,
      timestampMs: Math.max(0, timestampMs),
    });
    
    setEventCount(eventsRef.current.length);
  }, [isRecording]);

  /**
   * Stops recording, quantizes events into micro-timed tracker steps, and dispatches to project state.
   */
  const stopAndQuantize = useCallback(() => {
    if (!isRecording) return;
    setIsRecording(false);

    const state = projectController.getState();
    const pattern = selectPatternById(state, patternId);
    if (!pattern) {
      console.warn(`[useLivePhraseRecorder] Pattern not found for ID: ${patternId}`);
      return;
    }

    const assignments = state.sampler.assignments;
    
    // Quantize raw performance events into M8-style tracker pattern with micro-timing
    const quantizedPattern = PhraseRecorder.quantizeEventsToPattern(
      eventsRef.current,
      pattern,
      assignments,
      { bpm }
    );

    // Dispatch state update via project controller action
    projectController.dispatch({
      type: 'UPDATE_PATTERN',
      payload: { patternId, pattern: quantizedPattern },
    });

    console.log(`[useLivePhraseRecorder] Quantized ${eventsRef.current.length} performance events into pattern ${patternId}`);
  }, [isRecording, patternId, bpm]);

  return {
    isRecording,
    eventCount,
    startRecording,
    recordHit,
    stopAndQuantize,
  };
}
