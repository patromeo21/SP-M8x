/**
 * SP-M8x Hybrid Music Production Suite
 * trackerBridge.ts — Connects Tracker Playhead Steps to Sampler Audio Triggers
 */

import { audioEngine } from '../audio/audioEngine';
import { projectController, type Pattern } from '../project/projectController';

export interface TrackerStepEvent {
  stepIndex: number;
  note?: string;
  sampleId?: string;
  fx?: string;
}

export interface PadPlaybackSettings {
  startPct: number; // 0-100
  endPct: number; // 0-100
  pitch: number; // semitones
}

export type PadSettingsProvider = (padId: string) => PadPlaybackSettings | undefined;

interface PendingVoice {
  voiceId: string;
  time: number;
}

const PAD_ID_PATTERN = /^[A-D](?:[1-9]|1[0-6])$/;
const EMPTY_NOTE = '---';
const EMPTY_SAMPLE = '--';
const FALLBACK_PAD_ID = 'A1';
const DEFAULT_STEP_COUNT = 64;

class TrackerBridge {
  private padSettingsProvider: PadSettingsProvider | null = null;
  private pendingVoices: PendingVoice[] = [];

  /** Lets the sampler UI supply live slice/pitch settings without coupling the bridge to React. */
  public setPadSettingsProvider(provider: PadSettingsProvider | null): void {
    this.padSettingsProvider = provider;
  }

  public getStepCount(): number {
    const pattern = this.getActivePattern();
    return pattern && pattern.steps.length > 0 ? pattern.steps.length : DEFAULT_STEP_COUNT;
  }

  /**
   * Schedules the step at an exact AudioContext timestamp (seconds).
   * Empty steps, invalid pad IDs, and pads without a loaded buffer are skipped.
   */
  public scheduleStep(stepIndex: number, stepTime: number, stepDuration: number): void {
    const step = this.getActivePattern()?.steps[stepIndex];
    if (!step) return;
    const rawOffset = step.subTickOffset;
    const offset = typeof rawOffset === 'number' && Number.isFinite(rawOffset) ? Math.max(-4, Math.min(4, rawOffset)) : 0;
    const scheduledTime = stepTime + offset * stepDuration / 8;
    const now = audioEngine.getContext()?.currentTime ?? 0;
    if (scheduledTime < now - 0.01) return;

    const hasSample = Boolean(step.sampleId) && step.sampleId !== EMPTY_SAMPLE;
    const hasNote = Boolean(step.note) && step.note !== EMPTY_NOTE;
    if (!hasSample && !hasNote) return;

    const padId = hasSample ? step.sampleId : FALLBACK_PAD_ID;
    if (!PAD_ID_PATTERN.test(padId)) return;

    const buffer = audioEngine.getPadBuffer(padId);
    if (!buffer) return;

    const settings = this.padSettingsProvider?.(padId);
    const startPct = settings?.startPct ?? 0;
    const endPct = settings?.endPct ?? 100;

    const voiceId = audioEngine.triggerPad(padId, {
      sliceStart: (startPct / 100) * buffer.duration,
      sliceEnd: (endPct / 100) * buffer.duration,
      semitoneOffset: settings?.pitch ?? 0,
      volume: 1,
      loop: false,
      scheduledTime,
    });

    this.prunePending();
    if (voiceId) this.pendingVoices.push({ voiceId, time: scheduledTime });
  }

  /** Cancels voices that were scheduled but have not started yet (used when playback stops). */
  public cancelPending(): void {
    const now = audioEngine.getContext()?.currentTime ?? 0;
    for (const pending of this.pendingVoices) {
      if (pending.time > now) audioEngine.stopVoice(pending.voiceId);
    }
    this.pendingVoices = [];
  }

  private prunePending(): void {
    const now = audioEngine.getContext()?.currentTime ?? 0;
    this.pendingVoices = this.pendingVoices.filter((pending) => pending.time > now);
  }

  private getActivePattern(): Pattern | undefined {
    const state = projectController.getState();
    return state.tracker.patterns[state.settings.activePatternIndex ?? 0];
  }
}

export const trackerBridge = new TrackerBridge();
export default trackerBridge;
