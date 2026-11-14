import { trackerBridge } from './trackerBridge';
import { audioEngine } from '../audio/audioEngine';

const LOOKAHEAD_SECONDS = 0.1;
const TIMER_MS = 25;

export class TrackerEngine {
  private playing = false;
  private timerId: number | null = null;
  private generation = 0;
  private startTime = 0;
  private nextStep = 0;
  private lastDisplayedStep = -1;
  private bpm: number;
  private onStep?: (step: number) => void;
  private onStopped?: (reason?: string) => void;

  constructor(bpm = 120) {
    this.bpm = bpm;
  }

  public setCallbacks(onStep: (step: number) => void, onStopped: (reason?: string) => void): void {
    this.onStep = onStep;
    this.onStopped = onStopped;
  }

  public async start(bpm = this.bpm): Promise<void> {
    if (this.playing) return;
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 300) throw new Error('Invalid tempo.');
    this.bpm = bpm;
    const generation = ++this.generation;
    const context = await audioEngine.initialize();
    if (generation !== this.generation) return;
    this.playing = true;
    this.startTime = context.currentTime + 0.08;
    this.nextStep = 0;
    this.lastDisplayedStep = -1;
    this.tick();
    if (!this.playing) throw new Error('Audio paused before transport started.');
    this.timerId = window.setInterval(() => this.tick(), TIMER_MS);
  }

  public stop(reason?: string): void {
    this.generation++;
    const wasPlaying = this.playing;
    this.playing = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    trackerBridge.cancelPending();
    if (wasPlaying) this.onStopped?.(reason);
  }

  /** Nearest step plus signed eighth-step microtiming relative to the audio clock. */
  public recordPosition(time: number): { step: number; subTickOffset: number } | null {
    if (!this.playing || time < this.startTime) return null;
    const position = (time - this.startTime) / this.stepDuration;
    const nearest = Math.round(position);
    return {
      step: nearest % trackerBridge.getStepCount(),
      subTickOffset: Math.max(-4, Math.min(4, Math.round((position - nearest) * 8))),
    };
  }

  private get stepDuration(): number {
    return 60 / this.bpm / 4;
  }

  private tick(): void {
    const context = audioEngine.getContext();
    if (!context || context.state !== 'running') {
      this.stop('Audio paused; tap PLAY to restart.');
      return;
    }
    const now = context.currentTime;
    const duration = this.stepDuration;
    const stepCount = trackerBridge.getStepCount();
    const displayStep = now < this.startTime ? -1 : Math.floor((now - this.startTime) / duration) % stepCount;
    if (displayStep !== this.lastDisplayedStep) {
      this.lastDisplayedStep = displayStep;
      this.onStep?.(displayStep);
    }

    // Include half a step for negatively offset notes in the next step.
    const horizon = now + LOOKAHEAD_SECONDS + duration / 2;
    this.nextStep = Math.max(this.nextStep, Math.ceil((now - duration / 2 - this.startTime) / duration));
    while (this.startTime + this.nextStep * duration < horizon) {
      const stepTime = this.startTime + this.nextStep * duration;
      if (stepTime + duration / 2 >= now) {
        trackerBridge.scheduleStep(this.nextStep % stepCount, stepTime, duration);
      }
      this.nextStep++;
    }
  }
}

export const trackerEngine = new TrackerEngine();
