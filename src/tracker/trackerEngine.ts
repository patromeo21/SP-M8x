/**
 * SP-M8x Hybrid Music Production Suite
 * trackerEngine.ts — Step Sequencer Playhead & Tracker Bridge Integration
 */

import { audioEngine } from '../audio/audioEngine';
import { projectController } from '../project/projectController';
import { trackerBridge } from './trackerBridge';

export class TrackerEngine {
  private currentStep: number = 0;
  private isPlaying: boolean = false;
  private timerId: number | null = null;
  private bpm: number = 120;
  private onStepCallback?: (step: number) => void;

  constructor(bpm: number = 120) {
    this.bpm = bpm;
  }

  public setStepCallback(callback: (step: number) => void): void {
    this.onStepCallback = callback;
  }

  public setBpm(bpm: number): void {
    this.bpm = bpm;
    if (this.isPlaying) {
      this.stop();
      this.start();
    }
  }

  public start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;

    const intervalMs = (60000 / this.bpm) / 4;
    this.timerId = window.setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  public stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public togglePlay(): boolean {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  private tick(): void {
    const state = projectController.getState();
    const patternIndex = state.settings.activePatternIndex ?? 0;
    const currentPattern = state.tracker.patterns[patternIndex];
    const patternLength = Math.max(1, Math.min(16, currentPattern?.steps.length ?? 16));

    if (this.onStepCallback) {
      this.onStepCallback(this.currentStep);
    }

    const now = audioEngine.getContext()?.currentTime ?? 0;
    trackerBridge.handleStepTrigger(this.currentStep, now);

    this.currentStep = (this.currentStep + 1) % patternLength;
  }
}

export const trackerEngine = new TrackerEngine();
export default trackerEngine;
