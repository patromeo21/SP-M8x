/**
 * SP-M8x Hybrid Music Production Suite
 * trackerEngine.ts — Step Sequencer Playhead & Tracker Bridge Integration
 */

import { trackerBridge } from './trackerBridge';
import { audioEngine } from '../audio/audioEngine';

export class TrackerEngine {
  private currentStep: number = 0;
  private isPlaying: boolean = false;
  private timerId: number | null = null;
  private startGeneration = 0;
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
    const generation = ++this.startGeneration;

    void audioEngine.initialize().then(() => {
      if (!this.isPlaying || generation !== this.startGeneration) return;
      const intervalMs = (60000 / this.bpm) / 4;
      this.timerId = window.setInterval(() => {
        this.tick();
      }, intervalMs);
      console.log(`[TrackerEngine] Started playback at ${this.bpm} BPM`);
    }).catch((error: unknown) => {
      if (generation !== this.startGeneration) return;
      this.isPlaying = false;
      console.error('[TrackerEngine] Could not start audio:', error);
    });
  }

  public stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.startGeneration++;
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

    const context = audioEngine.getContext();
    if (!context || context.state !== 'running') {
      console.error('[TrackerEngine] Audio context is not running; stopping playback.');
      this.stop();
      return;
    }
    trackerBridge.scheduleStep(this.currentStep, context.currentTime);

    this.currentStep = (this.currentStep + 1) % trackerBridge.getStepCount();
  }
}

export const trackerEngine = new TrackerEngine();
export default trackerEngine;