import { trackerBridge } from './trackerBridge';
import { audioEngine } from '../audio/audioEngine';
import { rmxStepIndex, type FxBus, type RmxLength } from '../fx/fxEngine';
import { projectController } from '../project/projectController';
import { evaluateTrig } from './trigEvaluator';
import { nextBarTime } from './barTiming';

const LOOKAHEAD_SECONDS = 0.1;
const TIMER_MS = 25;
const BAR_STEPS = 16;
interface PatternSegment { patternIndex: number; startStep: number; length: number }

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
  private rmx: { bus: FxBus; length: RmxLength; anchor: number } | null = null;
  private segments: PatternSegment[] = [];
  private queuedPattern: number | null = null;
  private fillActive = false;
  private displayedPattern: number | null = null;
  private onPattern?: (index: number) => void;
  private stopListeners = new Set<() => void>();

  constructor(bpm = 120) {
    this.bpm = bpm;
  }

  public setCallbacks(onStep: (step: number) => void, onStopped: (reason?: string) => void, onPattern?: (index: number) => void): void {
    this.onStep = onStep;
    this.onStopped = onStopped;
    this.onPattern = onPattern;
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
    const state = projectController.getState();
    const index = state.settings.activePatternIndex;
    this.segments = [{ patternIndex: index, startStep: 0, length: state.tracker.patterns[index].length }];
    this.queuedPattern = null;
    this.displayedPattern = index;
    this.lastDisplayedStep = -1;
    this.tick();
    if (!this.playing) throw new Error('Audio paused before transport started.');
    this.timerId = window.setInterval(() => this.tick(), TIMER_MS);
  }

  public stop(reason?: string): void {
    this.generation++;
    const wasPlaying = this.playing;
    this.playing = false;
    this.fillActive = false;
    this.rmx = null;
    this.queuedPattern = null;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    trackerBridge.cancelPending();
    if (wasPlaying) this.stopListeners.forEach((listener) => listener());
    if (wasPlaying) this.onStopped?.(reason);
  }

  public subscribeStop(listener: () => void): () => void {
    this.stopListeners.add(listener);
    return () => { this.stopListeners.delete(listener); };
  }

  public nextBar(afterTime: number): { time: number; bpm: number } {
    if (!this.playing) throw new Error('Start the transport before bouncing.');
    return { time: nextBarTime(this.startTime, this.bpm, afterTime), bpm: this.bpm };
  }

  public setFillActive(active: boolean): void {
    this.fillActive = active;
  }

  /** Nearest step plus signed eighth-step microtiming relative to the audio clock. */
  public recordPosition(time: number): { step: number; subTickOffset: number; patternIndex: number } | null {
    if (!this.playing || time < this.startTime) return null;
    const position = (time - this.startTime) / this.stepDuration;
    const nearest = Math.round(position);
    const segment = this.segmentAt(nearest);
    if (!segment) return null;
    return {
      step: (nearest - segment.startStep) % segment.length,
      subTickOffset: Math.max(-4, Math.min(4, Math.round((position - nearest) * 8))),
      patternIndex: segment.patternIndex,
    };
  }

  public queuePattern(index: number | null): boolean {
    if (!this.playing) throw new Error('Transport is not playing.');
    if (index !== null && !projectController.getState().tracker.patterns[index]) throw new Error('Pattern is unavailable.');
    this.queuedPattern = index === this.segments.at(-1)?.patternIndex ? null : index;
    return this.queuedPattern !== null;
  }

  private segmentAt(step: number): PatternSegment | undefined {
    for (let index = this.segments.length - 1; index >= 0; index--) {
      if (this.segments[index].startStep <= step) return this.segments[index];
    }
    return undefined;
  }

  public startRmx(bus: FxBus, length: RmxLength): boolean {
    const context = audioEngine.getContext();
    if (!this.playing || !context || context.currentTime < this.startTime) return false;
    this.rmx = { bus, length, anchor: Math.floor((context.currentTime - this.startTime) / this.stepDuration) };
    return true;
  }

  public stopRmx(): void {
    this.rmx = null;
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
    const absoluteDisplayStep = now < this.startTime ? -1 : Math.floor((now - this.startTime) / duration);
    const displaySegment = this.segmentAt(absoluteDisplayStep);
    const displayStep = displaySegment ? (absoluteDisplayStep - displaySegment.startStep) % displaySegment.length : -1;
    if (displaySegment && displaySegment.patternIndex !== this.displayedPattern) {
      this.displayedPattern = displaySegment.patternIndex;
      this.onPattern?.(displaySegment.patternIndex);
    }
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
        let boundary = false;
        if (this.queuedPattern !== null && this.nextStep > 0 && this.nextStep % BAR_STEPS === 0) {
          const index = this.queuedPattern;
          const pattern = projectController.getState().tracker.patterns[index];
          if (!pattern) { this.stop('Queued phrase is unavailable.'); return; }
          this.segments.push({ patternIndex: index, startStep: this.nextStep, length: pattern.length });
          if (this.segments.length > 64) this.segments.shift();
          this.queuedPattern = null;
          boundary = true;
        }
        const segment = this.segmentAt(this.nextStep);
        if (!segment) { this.stop('Phrase timeline is unavailable.'); return; }
        const localStep = this.nextStep - segment.startStep;
        const pattern = projectController.getState().tracker.patterns[segment.patternIndex];
        const rmx = this.rmx;
        const rmxStep = rmx
          ? rmxStepIndex(localStep, Math.max(0, rmx.anchor - segment.startStep), segment.length, rmx.length)
          : null;
        const cycle = Math.floor(this.nextStep / BAR_STEPS);
        const allowedTracks = new Set(pattern.tracks
          .filter((track) => {
            const trackStep = rmx && rmxStep !== null && track.id >= (rmx.bus === 'B' ? 4 : 0) &&
              track.id <= (rmx.bus === 'A' ? 3 : 7) ? rmxStep : localStep % segment.length;
            const trig = track.steps[trackStep]?.trig;
            return !trig || evaluateTrig(trig, cycle, this.fillActive);
          })
          .map((track) => track.id));
        trackerBridge.scheduleStep(localStep % segment.length, stepTime, duration, rmx ? {
          stepIndex: rmxStep ?? localStep % segment.length,
          firstTrack: rmx.bus === 'B' ? 4 : 0,
          lastTrack: rmx.bus === 'A' ? 3 : 7,
        } : undefined, segment.patternIndex, boundary, allowedTracks);
      }
      this.nextStep++;
    }
  }
}

export const trackerEngine = new TrackerEngine();
