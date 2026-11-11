/**
 * SP-M8x Hybrid Music Production Suite
 * trackerBridge.ts — Connects Tracker Playhead Steps to Sampler Audio Triggers
 */

import { audioEngine } from '../audio/audioEngine';

export interface TrackerStepEvent {
  stepIndex: number;
  note: string;
  sampleId?: string;
  fx?: string;
}

class TrackerBridge {
  public handleStepTrigger(stepData: TrackerStepEvent): void {
    if (!stepData || (!stepData.sampleId && !stepData.note) || stepData.sampleId === '--') {
      return; // Empty step, skip
    }

    const padId = stepData.sampleId ?? stepData.note; 
    console.log(`[TrackerBridge] Playhead hit step ${stepData.stepIndex} -> Triggering Pad/Sample ${padId}`);

    // If an audio buffer is loaded for this pad, trigger it via audioEngine
    // e.g., audioEngine.triggerVoice(padId, buffer);
  }
}

export const trackerBridge = new TrackerBridge();