/**
 * SP-M8x M8 Tracker Engine
 * trackerEngine.ts — Sequencer clock, pattern management, and step dispatching
 */

import { TrackerPattern, TrackerStep } from '../types';
import { audioEngine } from '../audioEngine';

class TrackerEngine {
  private bpm: number = 125;
  private currentStep: number = 0;
  private isPlaying: boolean = false;
  private timerId: number | null = null;
  private activePattern: TrackerPattern;
  private onStepCallback: ((step: number) => void) | null = null;

  constructor() {
    // Initialize with a default 64-step empty pattern
    this.activePattern = {
      id: 0,
      length: 64,
      steps: Array.from({ length: 64 }, (_, i) => ({
        row: i,
        note: '---',
        instrument: 0,
        volume: 48,
        command: '--',
        value: 0,
      })),
    };
  }

  public setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(300, bpm));
    if (this.isPlaying) {
      this.stop();
      this.start();
    }
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setPattern(pattern: TrackerPattern): void {
    this.activePattern = pattern;
  }

  public getPattern(): TrackerPattern {
    return this.activePattern;
  }

  public updateStep(row: number, updatedStep: Partial<TrackerStep>): void {
    if (row >= 0 && row < this.activePattern.steps.length) {
      this.activePattern.steps[row] = {
        ...this.activePattern.steps[row],
        ...updatedStep,
      };
    }
  }

  public setOnStepCallback(callback: (step: number) => void): void {
    this.onStepCallback = callback;
  }

  public start(): void {
    if (this.isPlaying) return;
    this.isPlaying = this.runLoop.bind(this);

    // Calculate interval for 16th note steps based on BPM
    // 60 seconds / BPM / 4 steps per beat = interval in seconds
    const intervalMs = (60 / this.bpm / 4) * 1000;

    this.timerId = window.setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  public stop(): void {
    if (!this.isPlaying) return;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isPlaying = false;
    this.currentStep = 0;
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
    const stepData = this.activePattern.steps[this.currentStep];

    // If a valid note is present, trigger the corresponding instrument/pad
    if (stepData && stepData.note !== '---') {
      audioEngine.triggerPad(stepData.instrument, {
        volume: stepData.volume / 63, // Normalize M8 0-63 volume range
        semitoneOffset: 0,
      });
    }

    if (this.onStepCallback) {
      this.onStepCallback(this.currentStep);
    }

    // Advance step pointer loop
    this.currentStep = (this.currentStep + 1) % this.activePattern.length;
  }
}

export const trackerEngine = new TrackerEngine();
