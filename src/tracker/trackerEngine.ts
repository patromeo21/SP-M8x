import { trackerBridge } from './trackerBridge';
import { audioEngine } from '../audio/audioEngine';
import { rmxStepIndex, type FxBus, type RmxLength } from '../fx/fxEngine';
import { projectController } from '../project/projectController';
import type { ConditionalTrig } from './stepTypes';
import { getGrooveMetronomePulses, GROOVE_PRESETS, type GroovePreset, isGroovePreset, writeGrooveSlots } from './groovePresets';

export { GROOVE_PRESETS, type GroovePreset };

const LOOKAHEAD_SECONDS = 0.1;
const TIMER_MS = 25;
const BAR_STEPS = 16;
const SUBTICKS_PER_STEP = 8;
const SUBTICKS_PER_BAR = BAR_STEPS * SUBTICKS_PER_STEP;
const MAX_SEGMENTS = 64;
const TRACK_MASKS: ReadonlySet<number>[] = [];

for (let mask = 0; mask < 256; mask++) {
  const tracks = new Set<number>();
  for (let track = 0; track < 8; track++) {
    if ((mask & (1 << track)) !== 0) tracks.add(track);
  }
  TRACK_MASKS.push(tracks);
}

interface PatternSegment { patternIndex: number; startStep: number; length: number }
interface TransportPosition { absoluteStep: number; stepFraction: number }

function passesTrig(trig: ConditionalTrig | undefined, cycle: number, fillActive: boolean): boolean {
  if (!trig) return true;
  if (trig.fillOnly && !fillActive) return false;
  if (trig.probability !== undefined && trig.probability < 100 && Math.random() * 100 >= trig.probability) return false;
  const condition = trig.cycleCondition;
  if (!condition) return true;
  const separator = condition.indexOf(':');
  if (separator < 0) return true;
  let matchCount = 0;
  let totalCycles = 0;
  for (let index = 0; index < separator; index++) {
    const digit = condition.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) return true;
    matchCount = matchCount * 10 + digit;
  }
  for (let index = separator + 1; index < condition.length; index++) {
    const digit = condition.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) return true;
    totalCycles = totalCycles * 10 + digit;
  }
  return totalCycles <= 0 || cycle % totalCycles + 1 === matchCount;
}

export class TrackerEngine {
  private playing = false;
  private paused = false;
  private timerId: number | null = null;
  private generation = 0;
  private startTime = 0;
  private nextStep = 0;
  private lastDisplayedStep = -1;
  private lastDisplayedSubtick = -1;
  private bpm: number;
  private secondsPerSubtick = 0;
  private readonly grooveSlots = new Uint8Array(BAR_STEPS);
  private readonly stepDurations = new Float64Array(BAR_STEPS);
  private readonly stepPrefix = new Float64Array(BAR_STEPS + 1);
  private readonly positionBuffer: TransportPosition = { absoluteStep: 0, stepFraction: 0 };
  private groovePreset: GroovePreset = '8-8';
  private metronomeEnabled = false;
  private metronomeVolume = 0.15;
  private countInActive = false;
  private countInStartTime = 0;
  private countInNextClick = 0;
  private pausedDuringCountIn = false;
  private heldStep = 0;
  private heldSubtick = 0;
  private heldFraction = 0;
  private onStep?: (step: number) => void;
  private onPosition?: (step: number, subtick: number) => void;
  private onStopped?: (reason?: string) => void;
  private rmx: { bus: FxBus; length: RmxLength; anchor: number } | null = null;
  private readonly segments: PatternSegment[] = [];
  private segmentCount = 0;
  private queuedPattern: number | null = null;
  private fillActive = false;
  private displayedPattern: number | null = null;
  private onPattern?: (index: number) => void;
  private stopListeners = new Set<() => void>();
  private readonly scheduledRmxScope = { stepIndex: 0, firstTrack: 0, lastTrack: 7 };

  constructor(bpm = 120) {
    this.bpm = bpm;
    for (let index = 0; index < MAX_SEGMENTS; index++) this.segments.push({ patternIndex: 0, startStep: 0, length: BAR_STEPS });
    writeGrooveSlots('8-8', this.grooveSlots);
    this.rebuildTiming();
  }

  public setCallbacks(
    onStep: (step: number) => void,
    onStopped: (reason?: string) => void,
    onPattern?: (index: number) => void,
    onPosition?: (step: number, subtick: number) => void,
  ): void {
    this.onStep = onStep;
    this.onStopped = onStopped;
    this.onPattern = onPattern;
    this.onPosition = onPosition;
  }

  public async start(bpm = this.bpm, countIn = false): Promise<void> {
    if (this.playing) return;
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 300) throw new Error('Invalid tempo.');
    this.bpm = bpm;
    this.rebuildTiming();
    const generation = ++this.generation;
    const context = await audioEngine.initialize();
    if (generation !== this.generation) return;
    this.playing = true;
    this.paused = false;
    this.startTime = context.currentTime + 0.08 + (countIn ? this.barDuration : 0);
    this.countInActive = countIn;
    this.countInStartTime = context.currentTime + 0.08;
    this.countInNextClick = 0;
    this.pausedDuringCountIn = false;
    this.nextStep = 0;
    const state = projectController.getState();
    const index = state.settings.activePatternIndex;
    const firstSegment = this.segments[0];
    firstSegment.patternIndex = index;
    firstSegment.startStep = 0;
    firstSegment.length = state.tracker.patterns[index].length;
    this.segmentCount = 1;
    this.queuedPattern = null;
    this.displayedPattern = index;
    this.lastDisplayedStep = -1;
    this.lastDisplayedSubtick = -1;
    this.tick();
    if (!this.playing) throw new Error('Audio paused before transport started.');
    this.timerId = window.setInterval(() => this.tick(), TIMER_MS);
  }

  public async resume(): Promise<void> {
    if (this.playing || !this.paused) return;
    const generation = ++this.generation;
    const context = await audioEngine.initialize();
    if (generation !== this.generation || !this.paused) return;
    this.playing = true;
    this.paused = false;
    if (this.pausedDuringCountIn) {
      this.countInActive = true;
      this.countInStartTime = context.currentTime + 0.08;
      this.countInNextClick = 0;
      this.startTime = this.countInStartTime + this.barDuration;
      this.nextStep = 0;
    } else {
      this.countInActive = false;
      this.startTime = context.currentTime - this.elapsedAtStep(this.heldStep, this.heldFraction);
      this.nextStep = this.heldSubtick === 0 ? this.heldStep : this.heldStep + 1;
    }
    this.lastDisplayedStep = -1;
    this.lastDisplayedSubtick = -1;
    this.tick();
    if (!this.playing) throw new Error('Audio paused before transport resumed.');
    this.timerId = window.setInterval(() => this.tick(), TIMER_MS);
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public pause(): void {
    if (!this.playing) return;
    const now = audioEngine.getContext()?.currentTime ?? this.startTime;
    this.pausedDuringCountIn = this.countInActive && now < this.startTime;
    const position = this.positionAtTime(now);
    if (position) {
      this.heldStep = position.absoluteStep;
      this.heldSubtick = Math.min(SUBTICKS_PER_STEP - 1, Math.floor(position.stepFraction * SUBTICKS_PER_STEP));
      this.heldFraction = this.heldSubtick / SUBTICKS_PER_STEP;
      const segment = this.segmentAt(this.heldStep);
      if (segment) {
        const step = (this.heldStep - segment.startStep) % segment.length;
        this.onStep?.(step);
        this.onPosition?.(step, this.heldSubtick);
      }
    } else {
      this.heldStep = 0;
      this.heldSubtick = 0;
      this.heldFraction = 0;
      this.onStep?.(0);
      this.onPosition?.(0, 0);
    }
    this.playing = false;
    this.paused = true;
    this.clearTimer();
    trackerBridge.cancelPending();
    audioEngine.stopAllVoices();
    audioEngine.cancelMetronomeClicks();
  }

  public stop(reason?: string): void {
    this.generation++;
    const wasActive = this.playing || this.paused;
    this.playing = false;
    this.paused = false;
    this.fillActive = false;
    this.rmx = null;
    this.queuedPattern = null;
    this.countInActive = false;
    this.pausedDuringCountIn = false;
    this.heldStep = 0;
    this.heldSubtick = 0;
    this.heldFraction = 0;
    this.clearTimer();
    trackerBridge.cancelPending();
    audioEngine.stopAllVoices();
    audioEngine.cancelMetronomeClicks();
    if (wasActive) this.stopListeners.forEach((listener) => listener());
    this.lastDisplayedStep = 0;
    this.lastDisplayedSubtick = 0;
    if (wasActive) {
      this.onStep?.(0);
      this.onPosition?.(0, 0);
      this.onStopped?.(reason);
    }
  }

  private clearTimer(): void {
    if (this.timerId === null) return;
    window.clearInterval(this.timerId);
    this.timerId = null;
  }

  public subscribeStop(listener: () => void): () => void {
    this.stopListeners.add(listener);
    return () => { this.stopListeners.delete(listener); };
  }

  public nextBar(afterTime: number): { time: number; bpm: number } {
    if (!this.playing) throw new Error('Start the transport before bouncing.');
    const barIndex = Math.max(0, Math.ceil((afterTime - this.startTime) / this.barDuration));
    return { time: this.startTime + barIndex * this.barDuration, bpm: this.bpm };
  }

  public setFillActive(active: boolean): void {
    this.fillActive = active;
  }

  public setBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 300) throw new Error('Invalid tempo.');
    if (bpm === this.bpm) return;
    const context = audioEngine.getContext();
    const position = this.playing && context ? this.positionAtTime(context.currentTime) : null;
    this.bpm = bpm;
    this.rebuildTiming();
    if (position && context) {
      trackerBridge.cancelPending();
      audioEngine.cancelMetronomeClicks();
      this.startTime = context.currentTime - this.elapsedAtStep(position.absoluteStep, position.stepFraction);
      this.nextStep = position.absoluteStep + 1;
    } else if (this.playing && this.countInActive && context) {
      audioEngine.cancelMetronomeClicks();
      this.startTime = this.countInStartTime + this.barDuration;
      this.countInNextClick = Math.max(0, Math.min(4,
        Math.ceil((context.currentTime - this.countInStartTime) * this.bpm / 60)));
    }
  }

  public setGroovePreset(preset: string): void {
    if (!isGroovePreset(preset)) throw new Error('Invalid groove preset.');
    if (preset === this.groovePreset) return;
    const context = audioEngine.getContext();
    const position = this.playing && context ? this.positionAtTime(context.currentTime) : null;
    this.groovePreset = preset;
    writeGrooveSlots(preset, this.grooveSlots);
    this.rebuildTiming();
    if (position && context) {
      trackerBridge.cancelPending();
      audioEngine.cancelMetronomeClicks();
      this.startTime = context.currentTime - this.elapsedAtStep(position.absoluteStep, position.stepFraction);
      this.nextStep = position.absoluteStep + 1;
    } else if (this.playing && this.countInActive && context) {
      audioEngine.cancelMetronomeClicks();
      this.startTime = this.countInStartTime + this.barDuration;
      this.countInNextClick = Math.max(0, Math.min(4,
        Math.ceil((context.currentTime - this.countInStartTime) * this.bpm / 60)));
    }
  }

  public getGroovePreset(): GroovePreset {
    return this.groovePreset;
  }

  public setMetronome(enabled: boolean, volume = this.metronomeVolume): void {
    this.metronomeEnabled = enabled;
    this.metronomeVolume = Math.max(0, Math.min(1, volume));
    if (!enabled) audioEngine.cancelMetronomeClicks();
  }

  /** Nearest step plus signed eighth-step microtiming relative to the audio clock. */
  public recordPosition(time: number): { step: number; subTickOffset: number; patternIndex: number } | null {
    if (!this.playing || time < this.startTime) return null;
    const position = this.positionAtTime(time);
    if (!position) return null;
    const nearest = position.absoluteStep + (position.stepFraction >= 0.5 ? 1 : 0);
    const segment = this.segmentAt(nearest);
    if (!segment) return null;
    const stepDuration = this.stepDuration(nearest);
    const subTickDuration = stepDuration / SUBTICKS_PER_STEP;
    const subTickOffset = Math.round((time - this.stepTime(nearest)) / subTickDuration);
    return {
      step: (nearest - segment.startStep) % segment.length,
      subTickOffset: Math.max(-8, Math.min(8, Math.round(subTickOffset))),
      patternIndex: segment.patternIndex,
    };
  }

  public queuePattern(index: number | null): boolean {
    if (!this.playing) throw new Error('Transport is not playing.');
    if (index !== null && !projectController.getState().tracker.patterns[index]) throw new Error('Pattern is unavailable.');
    this.queuedPattern = index === this.segments[this.segmentCount - 1].patternIndex ? null : index;
    return this.queuedPattern !== null;
  }

  private segmentAt(step: number): PatternSegment | undefined {
    for (let index = this.segmentCount - 1; index >= 0; index--) {
      if (this.segments[index].startStep <= step) return this.segments[index];
    }
    return undefined;
  }

  public startRmx(bus: FxBus, length: RmxLength): boolean {
    const context = audioEngine.getContext();
    if (!this.playing || !context || context.currentTime < this.startTime) return false;
    this.rmx ??= { bus, length, anchor: 0 };
    this.rmx.bus = bus;
    this.rmx.length = length;
    this.rmx.anchor = this.positionAtTime(context.currentTime)?.absoluteStep ?? 0;
    return true;
  }

  public stopRmx(): void {
    this.rmx = null;
  }

  private get barDuration(): number {
    return this.stepPrefix[BAR_STEPS];
  }

  private rebuildTiming(): void {
    this.secondsPerSubtick = 4 * 60 / this.bpm / SUBTICKS_PER_BAR;
    this.stepPrefix[0] = 0;
    for (let step = 0; step < BAR_STEPS; step++) {
      const duration = this.grooveSlots[step] * this.secondsPerSubtick;
      this.stepDurations[step] = duration;
      this.stepPrefix[step + 1] = this.stepPrefix[step] + duration;
    }
  }

  private elapsedAtStep(step: number, fraction = 0): number {
    const bar = Math.floor(step / BAR_STEPS);
    const slot = step % BAR_STEPS;
    return bar * this.barDuration + this.stepPrefix[slot] + this.stepDurations[slot] * fraction;
  }

  private positionAtTime(time: number): TransportPosition | null {
    if (time < this.startTime) return null;
    const elapsed = time - this.startTime;
    const bar = Math.floor(elapsed / this.barDuration);
    const inBar = elapsed - bar * this.barDuration;
    let low = 0;
    let high = BAR_STEPS;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (this.stepPrefix[middle] <= inBar) low = middle;
      else high = middle;
    }
    const fraction = Math.max(0, Math.min(0.999999999, (inBar - this.stepPrefix[low]) / this.stepDurations[low]));
    this.positionBuffer.absoluteStep = bar * BAR_STEPS + low;
    this.positionBuffer.stepFraction = fraction;
    return this.positionBuffer;
  }

  private stepTime(step: number): number {
    const bar = Math.floor(step / BAR_STEPS);
    const slot = step % BAR_STEPS;
    return this.startTime + bar * this.barDuration + this.stepPrefix[slot];
  }

  private stepDuration(step: number): number {
    return this.stepDurations[step % BAR_STEPS];
  }

  private scheduleCountIn(now: number, horizon: number): void {
    if (!this.countInActive) return;
    while (this.countInNextClick < 4) {
      const clickTime = this.countInStartTime + this.countInNextClick * 60 / this.bpm;
      if (clickTime >= horizon) break;
      if (clickTime >= now) audioEngine.scheduleMetronomeClick(clickTime, this.metronomeVolume, this.countInNextClick === 0);
      this.countInNextClick++;
    }
    if (now >= this.startTime) this.countInActive = false;
  }

  private tick(): void {
    const context = audioEngine.getContext();
    if (!context || context.state !== 'running') {
      this.stop('Audio paused; tap PLAY to restart.');
      return;
    }
    const now = context.currentTime;
    const currentPosition = this.positionAtTime(now);
    const absoluteDisplayStep = currentPosition?.absoluteStep ?? -1;
    const displaySegment = absoluteDisplayStep >= 0 ? this.segmentAt(absoluteDisplayStep) : undefined;
    const displayStep = displaySegment ? (absoluteDisplayStep - displaySegment.startStep) % displaySegment.length : -1;
    const displaySubtick = currentPosition ? Math.min(7, Math.floor(currentPosition.stepFraction * SUBTICKS_PER_STEP)) : -1;
    if (displaySegment && displaySegment.patternIndex !== this.displayedPattern) {
      this.displayedPattern = displaySegment.patternIndex;
      this.onPattern?.(displaySegment.patternIndex);
    }
    const stepChanged = displayStep !== this.lastDisplayedStep;
    if (stepChanged) {
      this.lastDisplayedStep = displayStep;
      this.onStep?.(displayStep);
    }
    if ((stepChanged || displaySubtick !== this.lastDisplayedSubtick) && displayStep >= 0) {
      this.lastDisplayedSubtick = displaySubtick;
      this.onPosition?.(displayStep, displaySubtick);
    }

    const currentDuration = currentPosition ? this.stepDuration(currentPosition.absoluteStep) : this.stepDurations[0];
    const horizon = now + LOOKAHEAD_SECONDS + currentDuration / 2;
    this.scheduleCountIn(now, horizon);
    const metronomePulses = this.metronomeEnabled ? getGrooveMetronomePulses(this.groovePreset) : [];
    if (currentPosition && this.nextStep < currentPosition.absoluteStep) this.nextStep = currentPosition.absoluteStep;
    while (this.stepTime(this.nextStep) < horizon) {
      const scheduledStep = this.nextStep;
      const stepTime = this.stepTime(scheduledStep);
      const duration = this.stepDuration(scheduledStep);
      if (stepTime + duration / 2 >= now) {
        let boundary = false;
        if (this.queuedPattern !== null && scheduledStep > 0 && scheduledStep % BAR_STEPS === 0) {
          const index = this.queuedPattern;
          const pattern = projectController.getState().tracker.patterns[index];
          if (!pattern) { this.stop('Queued phrase is unavailable.'); return; }
          if (this.segmentCount === MAX_SEGMENTS) {
            for (let segment = 1; segment < MAX_SEGMENTS; segment++) {
              this.segments[segment - 1].patternIndex = this.segments[segment].patternIndex;
              this.segments[segment - 1].startStep = this.segments[segment].startStep;
              this.segments[segment - 1].length = this.segments[segment].length;
            }
            this.segmentCount--;
          }
          const nextSegment = this.segments[this.segmentCount++];
          nextSegment.patternIndex = index;
          nextSegment.startStep = scheduledStep;
          nextSegment.length = pattern.length;
          this.queuedPattern = null;
          boundary = true;
        }
        const segment = this.segmentAt(scheduledStep);
        if (!segment) { this.stop('Phrase timeline is unavailable.'); return; }
        const localStep = scheduledStep - segment.startStep;
        const pattern = projectController.getState().tracker.patterns[segment.patternIndex];
        const rmx = this.rmx;
        const rmxStep = rmx
          ? rmxStepIndex(localStep, Math.max(0, rmx.anchor - segment.startStep), segment.length, rmx.length)
          : null;
        const cycle = Math.floor(scheduledStep / BAR_STEPS);
        let trackMask = 0;
        for (let trackIndex = 0; trackIndex < pattern.tracks.length; trackIndex++) {
          const track = pattern.tracks[trackIndex];
          const inRmxRange = rmx !== null && rmxStep !== null &&
            track.id >= (rmx.bus === 'B' ? 4 : 0) && track.id <= (rmx.bus === 'A' ? 3 : 7);
          const trackStep = inRmxRange ? rmxStep : localStep % segment.length;
          if (passesTrig(track.steps[trackStep]?.trig, cycle, this.fillActive)) trackMask |= 1 << track.id;
        }
        if (rmx) {
          this.scheduledRmxScope.stepIndex = rmxStep ?? localStep % segment.length;
          this.scheduledRmxScope.firstTrack = rmx.bus === 'B' ? 4 : 0;
          this.scheduledRmxScope.lastTrack = rmx.bus === 'A' ? 3 : 7;
        }
        trackerBridge.scheduleStep(localStep % segment.length, stepTime, duration,
          rmx ? this.scheduledRmxScope : undefined, segment.patternIndex, boundary, TRACK_MASKS[trackMask]);
        const metronomePulse = metronomePulses.find((pulse) => pulse.step === scheduledStep % BAR_STEPS);
        if (metronomePulse) {
          audioEngine.scheduleMetronomeClick(stepTime, this.metronomeVolume, metronomePulse.downbeat);
        }
      }
      this.nextStep++;
    }
  }
}

export const trackerEngine = new TrackerEngine();
