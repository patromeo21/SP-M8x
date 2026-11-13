/**
 * SP-M8x Hybrid Music Production Suite
 * trackerBridge.ts — Connects Tracker Playhead Steps to Sampler Audio Triggers
 */

import { audioEngine } from '../audio/audioEngine';
import { projectController } from '../project/projectController';

export interface TrackerStepEvent {
  stepIndex: number;
  note?: string;
  sampleId?: string;
  fx?: string;
}

class TrackerBridge {
  /**
   * Evaluates the active pattern step at the given index and triggers sample playback.
   */
  public handleStepTrigger(stepIndex: number): void {
    const state = projectController.getState();
    const activePatternIdx = state.settings.activePatternIndex ?? 0;
    const currentPattern = state.tracker.patterns[activePatternIdx];

    if (!currentPattern || !currentPattern.steps[stepIndex]) return;

    const step = currentPattern.steps[stepIndex];

    // Skip empty or unassigned steps
    if (!step || (!step.sampleId && !step.note) || step.sampleId === '--' || step.note === '---') {
      return;
    }

    // Resolve target pad ID (e.g. "A1")
    const padId = step.sampleId && step.sampleId !== '--' ? step.sampleId : 'A1';

    console.log(`[TrackerBridge] Step ${stepIndex} -> Triggering Pad ${padId} (Note: ${step.note})`);

    // Execute polyphonic/monophonic voice trigger in Web Audio API
    void audioEngine.triggerVoice(padId).catch((error: unknown) => {
      console.error('[TrackerBridge] Could not start audio:', error);
    });
  }
}

export const trackerBridge = new TrackerBridge();
export default trackerBridge;