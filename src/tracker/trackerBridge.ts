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
  scheduledTime?: number;
  velocity?: number;
  subTickOffset?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

class TrackerBridge {
  /**
   * Evaluates the active pattern step at the given index and triggers a scheduled sample playback.
   */
  public handleStepTrigger(stepIndex: number, scheduledTime?: number): void {
    const state = projectController.getState();
    const activePatternIdx = state.settings.activePatternIndex ?? 0;
    const currentPattern = state.tracker.patterns[activePatternIdx];

    if (!currentPattern || !currentPattern.steps[stepIndex]) return;

    const step = currentPattern.steps[stepIndex];
    if (!step || (!step.sampleId && !step.note) || step.sampleId === '--' || step.note === '---') {
      return;
    }

    const padId = step.sampleId && step.sampleId !== '--' ? step.sampleId : 'A1';
    const baseBpm = state.settings.bpm || 120;
    const stepDurationSeconds = 60 / baseBpm / 4;
    const subdivisionCount = 8;
    const microOffset = clamp(step.subTickOffset ?? 0, 0, subdivisionCount - 1);
    const stepTime = typeof scheduledTime === 'number' ? scheduledTime : (audioEngine.getContext()?.currentTime ?? 0);
    const microStepDuration = stepDurationSeconds / subdivisionCount;
    const targetTime = stepTime + microOffset * microStepDuration;
    const gain = clamp((step.velocity ?? 127) / 127, 0, 1) * 0.8;

    audioEngine.triggerPad(padId, {
      volume: gain,
      scheduledTime: targetTime,
    });
  }
}

export const trackerBridge = new TrackerBridge();
export default trackerBridge;
