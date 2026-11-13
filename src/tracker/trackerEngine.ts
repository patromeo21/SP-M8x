// FILE: src/tracker/trackerEngine.ts
/**
 * SP-M8x Hybrid Music Production Suite
 * trackerEngine.ts — Audio-clock lookahead scheduler for 64-step phrases
 */

import { audioEngine } from '../audio/audioEngine';
import { projectController } from '../project/projectController';
import { trackerBridge } from './trackerBridge';

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SECONDS = 0.12;
const START_AHEAD_SECONDS = 0.05;
const PHRASE_STEP_COUNT = 64;
const PAGE_STEP_COUNT = 16;
const SUBDIVISION_COUNT = 8;
const MAX_TIMING_OFFSET_RATIO = 0.999;

export interface TrackerEngineState {
  isPlaying: boolean;
  bpm: number;
  currentStep: number;
  pageIndex: number;
  pageStepIndex: number;
}

export interface TrackerPlayheadPosition {
  stepIndex: number;
  pageIndex: number;
  pageStepIndex: number;
  scheduledTime: number;
  progress: number;
}

interface ScheduledVisualStep {
  stepIndex: number;
  scheduledTime: number;
  stepDuration: number;
}

export class TrackerEngine {
  private currentStep = 0;
  private isPlaying = false;
  private timerId: number | null = null;
  private nextStepTime = 0;
  private bpm = 120;
  private swing = 0;
  private onStepCallback?: (step: number) => void;
  private listeners = new Set<(state: TrackerEngineState) => void>();
  private scheduledSteps: ScheduledVisualStep[] = [];
  private lastVisualStep: ScheduledVisualStep = { stepIndex: 0, scheduledTime: 0, stepDuration: 0.125 };

  constructor(bpm = 120) {
    this.bpm = bpm;
  }

  /** Legacy callback, invoked by the scheduler. Do not use it to update React per step. */
  public setStepCallback(callback: (step: number) => void): void {
    this.onStepCallback = callback;
  }

  /** Subscribe to transport changes only; no notification is emitted per step. */
  public subscribe(listener: (state: TrackerEngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): TrackerEngineState {
    const playhead = this.getPlayheadPosition();
    return {
      isPlaying: this.isPlaying,
      bpm: this.bpm,
      currentStep: playhead.stepIndex,
      pageIndex: playhead.pageIndex,
      pageStepIndex: playhead.pageStepIndex,
    };
  }

  /** Read from requestAnimationFrame to animate the playhead without React renders. */
  public getPlayheadPosition(): TrackerPlayheadPosition {
    const now = audioEngine.getContext()?.currentTime ?? 0;

    while (this.scheduledSteps.length > 0 && this.scheduledSteps[0].scheduledTime <= now) {
      this.lastVisualStep = this.scheduledSteps.shift() as ScheduledVisualStep;
    }

    const event = this.lastVisualStep;
    const progress = event.stepDuration > 0
      ? Math.max(0, Math.min(1, (now - event.scheduledTime) / event.stepDuration))
      : 0;
    const stepIndex = event.stepIndex % PHRASE_STEP_COUNT;

    return {
      stepIndex,
      pageIndex: Math.floor(stepIndex / PAGE_STEP_COUNT),
      pageStepIndex: stepIndex % PAGE_STEP_COUNT,
      scheduledTime: event.scheduledTime,
      progress,
    };
  }

  private notifyTransport(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  public setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    this.bpm = Math.max(40, Math.min(300, bpm));
    if (!this.isPlaying) this.notifyTransport();
  }

  public start(): void {
    if (this.isPlaying) return;

    try {
      const context = audioEngine.ensureContext();
      if (!context) {
        throw new Error('AudioContext unavailable');
      }

      const settings = projectController.getState().settings;
      this.isPlaying = true;
      this.currentStep = 0;
      this.nextStepTime = context.currentTime + START_AHEAD_SECONDS;
      this.scheduledSteps = [];
      this.bpm = Number.isFinite(settings.bpm) ? Math.max(40, Math.min(300, settings.bpm)) : this.bpm;
      this.swing = Number.isFinite(settings.swing) ? Math.max(0, Math.min(1, settings.swing ?? 0)) : 0;
      const stepDuration = 60 / this.bpm / 4;
      this.lastVisualStep = { stepIndex: 0, scheduledTime: this.nextStepTime, stepDuration };
      this.notifyTransport();
      this.scheduleAhead();
      this.timerId = window.setInterval(() => this.scheduleAhead(), SCHEDULER_INTERVAL_MS);
    } catch (error) {
      this.isPlaying = false;
      this.notifyTransport();
      console.error('[TrackerEngine] Could not start audio playback:', error);
    }
  }

  public stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.nextStepTime = 0;
    this.currentStep = 0;
    this.scheduledSteps = [];
    this.notifyTransport();
  }

  public togglePlay(): boolean {
    if (this.isPlaying) this.stop();
    else this.start();
    return this.isPlaying;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private scheduleAhead(): void {
    if (!this.isPlaying) return;
    const context = audioEngine.getContext();
    if (!context) {
      this.stop();
      return;
    }

    const state = projectController.getState();
    const patternIndex = state.settings.activePatternIndex ?? 0;
    const pattern = state.tracker.patterns[patternIndex];
    const phraseLength = Math.max(1, Math.min(PHRASE_STEP_COUNT, pattern?.steps.length ?? PHRASE_STEP_COUNT));
    const bpm = Number.isFinite(state.settings.bpm) ? Math.max(40, Math.min(300, state.settings.bpm)) : this.bpm;
    const stepDuration = 60 / bpm / 4;
    const swing = Number.isFinite(state.settings.swing)
      ? Math.max(0, Math.min(1, state.settings.swing ?? this.swing))
      : this.swing;
    this.bpm = bpm;
    const scheduleUntil = context.currentTime + LOOKAHEAD_SECONDS;

    while (this.nextStepTime < scheduleUntil) {
      const stepIndex = this.currentStep % phraseLength;
      const stepData = pattern?.steps[stepIndex];
      const swingOffset = stepIndex % 2 === 1 ? stepDuration * 0.15 * swing : 0;
      const subTick = Math.max(0, Math.min(SUBDIVISION_COUNT - 1, stepData?.subTickOffset ?? 0));
      const subTickOffset = stepDuration * (subTick / SUBDIVISION_COUNT);
      const timingOffset = Math.min(stepDuration * MAX_TIMING_OFFSET_RATIO, swingOffset + subTickOffset);
      const eventTime = this.nextStepTime + timingOffset;

      trackerBridge.handleStepTrigger(stepIndex, eventTime);
      this.scheduledSteps.push({ stepIndex, scheduledTime: eventTime, stepDuration });
      this.onStepCallback?.(stepIndex);

      this.currentStep = (stepIndex + 1) % phraseLength;
      this.nextStepTime += stepDuration;
    }

    const oldestUsefulTime = context.currentTime - stepDuration;
    while (this.scheduledSteps.length > 1 && this.scheduledSteps[1].scheduledTime < oldestUsefulTime) {
      this.lastVisualStep = this.scheduledSteps.shift() as ScheduledVisualStep;
    }
  }
}

export const trackerEngine = new TrackerEngine();
export default trackerEngine;
