/**
 * SP-M8x Hybrid Music Production Suite
 * trackerBridge.ts — Connects Tracker Playhead Steps to Sampler Audio Triggers
 */

import { audioEngine } from '../audio/audioEngine';
import { projectController, type Pattern, type TrackerStepItem } from '../project/projectController';
import type { VoiceFxCommand } from '../fx/VoiceFxPool';
import { instrumentIdToPadId } from '../sampler/padIds';
import { sliceRange } from '../sampler/gridSlices';

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
  playbackMode: 'one-shot' | 'gate' | 'loop';
  sliceMarkers?: number[];
}

export type PadSettingsProvider = (padId: string) => PadPlaybackSettings | undefined;

interface PendingVoice {
  voiceId: string;
  time: number;
}

interface TableVoice extends PendingVoice {
  tableId: number;
  pageIndex: number;
  startTick: number;
  tickDuration: number;
}

const EMPTY_NOTE = '---';
const DEFAULT_STEP_COUNT = 32;

function noteOffset(note: string): number {
  const match = /^([A-G])([#-])(\d)$/.exec(note);
  if (!match) return 0;
  const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (Number(match[3]) + 1) * 12 + semitones[match[1]] + (match[2] === '#' ? 1 : 0) - 60;
}

export function getNormalizedTableStepIndex(currentStep: number): number {
  return currentStep * 8;
}

class TrackerBridge {
  private padSettingsProvider: PadSettingsProvider | null = null;
  private pendingVoices: PendingVoice[] = [];
  private tableVoices: TableVoice[] = [];

  /** Lets the sampler UI supply live slice/pitch settings without coupling the bridge to React. */
  public setPadSettingsProvider(provider: PadSettingsProvider | null): void {
    this.padSettingsProvider = provider;
  }

  public getStepCount(): number {
    const pattern = this.getActivePattern();
    return pattern?.length ?? DEFAULT_STEP_COUNT;
  }

  /**
   * Schedules the step at an exact AudioContext timestamp (seconds).
   * Empty steps, invalid pad IDs, and pads without a loaded buffer are skipped.
   */
  public scheduleStep(stepIndex: number, stepTime: number, stepDuration: number, rmx?: { stepIndex: number; firstTrack: number; lastTrack: number }): void {
    const pattern = this.getActivePattern();
    if (!pattern) return;
    for (const track of pattern.tracks) {
      const trackStep = rmx && track.id >= rmx.firstTrack && track.id <= rmx.lastTrack ? rmx.stepIndex : stepIndex;
      const step = track.steps[trackStep];
      if (step) this.scheduleTrackStep(step, track.id, trackStep, stepTime, stepDuration,
        rmx && track.id >= rmx.firstTrack && track.id <= rmx.lastTrack ? rmx : undefined);
    }
  }

  private scheduleTrackStep(step: TrackerStepItem, trackIndex: number, stepIndex: number, stepTime: number, stepDuration: number,
    rmxScope?: { firstTrack: number; lastTrack: number }): void {
    const rawOffset = step.subTickOffset;
    const offset = typeof rawOffset === 'number' && Number.isFinite(rawOffset) ? Math.max(-4, Math.min(4, rawOffset)) : 0;
    const scheduledTime = stepTime + offset * stepDuration / 8;
    const now = audioEngine.getContext()?.currentTime ?? 0;
    if (scheduledTime < now - 0.01) return;

    const hasNote = Boolean(step.note) && step.note !== EMPTY_NOTE && step.note !== 'OFF';
    const padId = instrumentIdToPadId(step.instrumentId);
    if (!padId) return;
    if (step.note === 'OFF') {
      audioEngine.releaseTrackGatedVoicesAt(padId, trackIndex, scheduledTime);
      return;
    }
    if (step.fx === 'OFF' || step.fx === '00') {
      if (rmxScope) audioEngine.resetPadFxAt(padId, scheduledTime, rmxScope);
      else audioEngine.resetPadFxAt(padId, scheduledTime);
      if (!hasNote) return;
    }
    if (!hasNote) return;

    const buffer = audioEngine.getPadBuffer(padId);
    if (!buffer) return;

    const settings = this.padSettingsProvider?.(padId);
    const padMetadata = projectController.getState().sampler.pads[padId];
    const startPct = settings?.startPct ?? 0;
    const endPct = settings?.endPct ?? 100;
    const slice = step.sliceIndex === undefined ? undefined : sliceRange(settings?.sliceMarkers ?? [], step.sliceIndex, buffer.length);
    if (step.sliceIndex !== undefined && !slice) {
      console.error(`[TrackerBridge] Missing or invalid slice ${step.sliceIndex} for ${padId}.`);
      return;
    }
    const table = projectController.getState().tracker.tables?.find((item) => item.id === step.tableId);
    const tableTick = getNormalizedTableStepIndex(stepIndex);
    const pageIndex = Math.floor(tableTick / 128);
    const startTick = tableTick % 128;
    const modulation: NonNullable<Parameters<typeof audioEngine.triggerPad>[1]>['modulation'] = [];
    if (table) {
      for (let tick = startTick; tick < 128; tick++) {
        const item = table.steps[pageIndex * 128 + tick];
        if (!item) break;
        const offset = (tick - startTick) * stepDuration / 8;
        const fx = item.reset ? { code: 'OFF' as const } : item.fx ? { code: item.fx, value: item.fxValue } : undefined;
        if (item.pitch !== null || item.volume !== null || fx) {
          modulation.push({
            offset,
            ...(item.pitch === null ? {} : { semitoneOffset: item.pitch }),
            ...(item.volume === null ? {} : { volume: item.volume / 127 }),
            ...(fx ? { fx } : {}),
          });
        }
      }
    }
    const velocity = typeof step.velocity === 'number' && Number.isFinite(step.velocity)
      ? Math.max(0, Math.min(127, step.velocity)) / 127 : 1;

    const voiceId = audioEngine.triggerPad(padId, {
      sliceStart: slice ? slice.start / buffer.sampleRate : (startPct / 100) * buffer.duration,
      sliceEnd: slice ? slice.end / buffer.sampleRate : (endPct / 100) * buffer.duration,
      semitoneOffset: (settings?.pitch ?? 0) + noteOffset(step.note),
      volume: velocity,
      loop: false,
      gated: settings?.playbackMode === 'gate',
      padVolume: padMetadata?.volume ?? 1,
      chokeGroup: padMetadata?.chokeGroup ?? null,
      chokeTrackRange: rmxScope,
      scheduledTime,
      trackIndex,
      modulation: modulation.length ? modulation : undefined,
      fx: step.fx === 'FL' || step.fx === 'DL' || step.fx === 'DR'
        ? { code: step.fx, value: step.fxValue } satisfies VoiceFxCommand : undefined,
    });

    this.prunePending();
    if (voiceId) {
      this.pendingVoices.push({ voiceId, time: scheduledTime });
      if (table && table.steps.length) {
        this.tableVoices = this.tableVoices.filter((voice) => audioEngine.hasVoice(voice.voiceId));
        this.tableVoices.push({
          voiceId, time: Math.max(scheduledTime, now), tableId: table.id, pageIndex, startTick,
          tickDuration: stepDuration / 8,
        });
      }
    }
  }

  public getPlayingTableTicks(tableId: number, pageIndex: number): number[] {
    const context = audioEngine.getContext();
    if (!context || context.state !== 'running') return [];
    this.tableVoices = this.tableVoices.filter((voice) => audioEngine.hasVoice(voice.voiceId));
    const ticks = new Set<number>();
    for (const voice of this.tableVoices) {
      if (voice.tableId !== tableId || voice.pageIndex !== pageIndex ||
          context.currentTime < voice.time || !audioEngine.isVoiceSounding(voice.voiceId)) continue;
      const tick = voice.startTick + Math.floor((context.currentTime - voice.time) / voice.tickDuration);
      if (tick < 128) ticks.add(tick);
    }
    return [...ticks].sort((a, b) => a - b);
  }

  /** Cancels voices that were scheduled but have not started yet (used when playback stops). */
  public cancelPending(): void {
    const now = audioEngine.getContext()?.currentTime ?? 0;
    for (const pending of this.pendingVoices) {
      if (pending.time > now) audioEngine.stopVoice(pending.voiceId);
    }
    this.pendingVoices = [];
    this.tableVoices = [];
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
