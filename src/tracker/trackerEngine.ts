/**
 * SP-M8x Hybrid Music Production Suite
 * trackerEngine.ts — Lookahead scheduler with swing and visual step sync
 */

import { audioEngine } from '../audio/audioEngine';
import { projectController } from '../project/projectController';
import { trackerBridge } from './trackerBridge';

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SECONDS = 0.12;
const START_AHEAD_SECONDS = 0.05;
const STEP_COUNT = 16;

export class TrackerEngine {
  private currentStep = 0;
  private isPlaying = false;
  private timerId: number | null = null;
  private nextStepTime = 0;
  private bpm = 120;
  private onStepCallback?: (step: number) => void;

  constructor(bpm = 120) {
    this.bpm = bpm;
  }

  public setStepCallback(callback: (step: number) => void): void {
    this.onStepCallback = callback;
  }

  public setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    this.bpm = Math.max(40, Math.min(300, bpm));
  }

  public start(): void {
    if (this.isPlaying) return;

    try {
      const context = audioEngine.initialize();
      const state = projectController.getState();
      this.isPlaying = true;
      this.nextStepTime = context.currentTime + START_AHEAD_SECONDS;
      this.currentStep = 0;
      this.bpm = Number.isFinite(state.settings.bpm) ? state.settings.bpm : this.bpm;
      this.scheduleAhead();
      this.timerId = window.setInterval(() => this.scheduleAhead(), SCHEDULER_INTERVAL_MS);
    } catch (error) {
      this.isPlaying = false;
      console.error('[TrackerEngine] Could not start audio playback:', error);
    }
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.nextStepTime = 0;
    this.currentStep = 0;
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
    const patternLength = Math.max(1, Math.min(STEP_COUNT, pattern?.steps.length ?? STEP_COUNT));
    const bpm = Number.isFinite(state.settings.bpm) ? state.settings.bpm : this.bpm;
    const stepDuration = 60 / Math.max(40, Math.min(300, bpm)) / 4;
    const swing = Number.isFinite(state.settings.swing) ? state.settings.swing ?? 0 : 0;
    const scheduleUntil = context.currentTime + LOOKAHEAD_SECONDS;

    while (this.nextStepTime < scheduleUntil) {
      const step = this.currentStep % patternLength;
      const swingOffset = step % 2 === 1 && swing > 0 ? stepDuration * 0.15 * swing : 0;
      trackerBridge.handleStepTrigger(step, this.nextStepTime + swingOffset);
      this.onStepCallback?.(step);

      this.currentStep = (step + 1) % patternLength;
      this.nextStepTime += stepDuration;
    }
  }
}

export const trackerEngine = new TrackerEngine();
export default trackerEngine;
