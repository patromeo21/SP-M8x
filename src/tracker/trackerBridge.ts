/**
 * SP-M8x Hybrid Music Production Suite
 * trackerBridge.ts — Connects Tracker Playhead Steps to Sampler Audio Triggers
 */

import { audioEngine } from '../audio/audioEngine';

export interface TrackerStepEvent {
  stepIndex: number;
  note: string;
  instrument: string; // e.g., 'A1', 'B02' corresponding to pad banks
  volume: string;
}

class TrackerBridge {
  public handleStepTrigger(stepData: TrackerStepEvent): void {
    if (!stepData || !stepData.instrument || stepData.instrument === '--') {
      return; // Empty step, do nothing
    }

    const padId = stepData.instrument; // e.g., 'A1' or 'B04'
    console.log(`[TrackerBridge] Playhead hit step ${stepData.stepIndex} -> Triggering Pad ${padId}`);

    // If an audio buffer exists for this pad, trigger it via audioEngine
    // audioEngine.triggerVoice(padId, buffer, playbackRate);
  }
}

export const trackerBridge = new TrackerBridge();