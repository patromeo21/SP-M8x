/**
 * SP-M8x Hybrid Music Production Suite
 * trackerBridge.ts — Translates tracker events into scheduled audio triggers
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
  /** The scheduler supplies the final event time, including swing and sub-tick timing. */
  public handleStepTrigger(stepIndex: number, scheduledTime?: number): void {
    const state = projectController.getState();
    const activePatternIdx = state.settings.activePatternIndex ?? 0;
    const currentPattern = state.tracker.patterns[activePatternIdx];
    const step = currentPattern?.steps[stepIndex];

    if (!step || (!step.sampleId && !step.note) || step.sampleId === '--' || step.note === '---') return;

    const padId = step.sampleId && step.sampleId !== '--' ? step.sampleId : 'A1';
    const targetTime = typeof scheduledTime === 'number'
      ? scheduledTime
      : (audioEngine.getContext()?.currentTime ?? 0);
    const gain = clamp((step.velocity ?? 127) / 127, 0, 1) * 0.8;

    audioEngine.triggerPad(padId, {
      volume: gain,
      scheduledTime: targetTime,
    });
  }
}

export const trackerBridge = new TrackerBridge();
export default trackerBridge;
