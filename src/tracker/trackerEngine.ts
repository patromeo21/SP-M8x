/**
 * SP-M8x Hybrid Music Production Suite
 * trackerEngine.ts — Step Sequencer Playhead & Tracker Bridge Integration
 */

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

    // Calculate 16th-note step interval: (60000ms / BPM) / 4
    const intervalMs = (60000 / this.bpm) / 4;

    this.timerId = window.setInterval(() => {
      this.tick();
    }, intervalMs);

    console.log(`[TrackerEngine] Started playback at ${this.bpm} BPM`);
  }

  public stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    console.log('[TrackerEngine] Stopped playback');
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
    if (this.onStepCallback) {
      this.onStepCallback(this.currentStep);
    }

    // Pass the active playhead index to the bridge for real-time sample execution
    trackerBridge.handleStepTrigger(this.currentStep);

    // Advance step pointer across 64-step pattern loop
    this.currentStep = (this.currentStep + 1) % 64;
  }
}

export const trackerEngine = new TrackerEngine();
export default trackerEngine;