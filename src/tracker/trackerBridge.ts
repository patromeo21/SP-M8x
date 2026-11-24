/**
 * SP-M8x Hybrid Music Production Suite
 * trackerBridge.ts — Connects Tracker Playhead Steps to Sampler Audio Triggers
 */

import { audioEngine } from '../audio/audioEngine';
import {
  projectController,
  type Pattern,
  type PunchInFx3Code,
  type TrackerStepItem,
  type VoiceSubtickFxCode,
} from '../project/projectController';
import type { VoiceFxCommand } from '../fx/VoiceFxPool';
import type { StepEvent } from '../project/stepModel';
import { instrumentIdToPadId } from '../sampler/padIds';
import { sliceRange } from '../sampler/gridSlices';

export interface TrackerStepEvent {
  stepIndex: number;
  note?: string;
  sampleId?: string;
  fx?: string;
  fx2?: string;
  fx3?: string;
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
const VOICE_FX_CODES = new Set<string>(['PS', 'FL', 'DL', 'OFF']);
const PUNCH_IN_FX3_CODES = new Set<string>(['PM', 'LF', 'BC', 'OFF']);

function noteOffset(note: string): number {
  const match = /^([A-G])([#-])(\d)$/.exec(note);
  if (!match) return 0;
  const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (Number(match[3]) + 1) * 12 + semitones[match[1]] + (match[2] === '#' ? 1 : 0) - 60;
}

function normalizeVoiceFxCode(raw: unknown): VoiceSubtickFxCode | undefined {
  if (typeof raw !== 'string' || raw === '' || raw === '00') return undefined;
  const upper = raw.toUpperCase();
  if (upper === 'DR') return 'OFF';
  return VOICE_FX_CODES.has(upper) ? (upper as VoiceSubtickFxCode) : undefined;
}

function normalizePunchInFx3Code(raw: unknown): PunchInFx3Code | undefined {
  if (typeof raw !== 'string' || raw === '' || raw === '00') return undefined;
  const upper = raw.toUpperCase();
  return PUNCH_IN_FX3_CODES.has(upper) ? (upper as PunchInFx3Code) : undefined;
}

function clampFxValue(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return Math.max(0, Math.min(127, Math.round(raw)));
}

function toVoiceFxCommand(rawCode: unknown, rawValue: unknown): VoiceFxCommand | undefined {
  const code = normalizeVoiceFxCode(rawCode);
  if (!code) return undefined;
  const value = clampFxValue(rawValue);
  return value === undefined ? { code } : { code, value };
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
  public scheduleStep(
    stepIndex: number,
    stepTime: number,
    stepDuration: number,
    rmx?: { stepIndex: number; firstTrack: number; lastTrack: number },
    patternIndex?: number,
    boundary = false,
    allowedTracks?: ReadonlySet<number>,
  ): void {
    const pattern =
      patternIndex === undefined
        ? this.getActivePattern()
        : projectController.getState().tracker.patterns[patternIndex];
    if (!pattern) return;
    for (const track of pattern.tracks) {
      if (allowedTracks && !allowedTracks.has(track.id)) continue;
      const trackStep =
        rmx && track.id >= rmx.firstTrack && track.id <= rmx.lastTrack ? rmx.stepIndex : stepIndex;
      const step = track.steps[trackStep];
      if (step) {
        this.scheduleTrackStep(
          step,
          track.id,
          trackStep,
          stepTime,
          stepDuration,
          rmx && track.id >= rmx.firstTrack && track.id <= rmx.lastTrack ? rmx : undefined,
          boundary,
        );
      }
    }
  }

  private scheduleTrackStep(
    step: TrackerStepItem,
    trackIndex: number,
    stepIndex: number,
    stepTime: number,
    stepDuration: number,
    rmxScope?: { firstTrack: number; lastTrack: number },
    boundary = false,
    event?: StepEvent,
  ): void {
    if (!event && step.note === 'OFF') {
      const padId = instrumentIdToPadId(step.instrumentId);
      if (padId) audioEngine.releaseTrackGatedVoicesAt(padId, trackIndex, stepTime);
      return;
    }

    if (!event && step.events?.length) {
      for (const polyphonicEvent of step.events) {
        this.scheduleTrackStep(
          step,
          trackIndex,
          stepIndex,
          stepTime,
          stepDuration,
          rmxScope,
          boundary,
          polyphonicEvent,
        );
      }
      return;
    }

    const rawOffset = event?.subTickOffset ?? step.subTickOffset;
    const offset =
      typeof rawOffset === 'number' && Number.isFinite(rawOffset)
        ? Math.max(boundary ? 0 : -8, Math.min(8, Math.round(rawOffset)))
        : 0;
    const scheduledTime = Math.max(0, stepTime + (offset * stepDuration) / 8);
    const now = audioEngine.getContext()?.currentTime ?? 0;
    if (scheduledTime < now - 0.01) return;

    const note = event?.note ?? step.note;
    const instrumentId = event ? event.instrumentId ?? event.padId : step.instrumentId;
    const hasNote = Boolean(note) && note !== EMPTY_NOTE && note !== 'OFF';
    const padId = instrumentIdToPadId(instrumentId);
    if (!padId) return;

    const fx1Code = normalizeVoiceFxCode(event?.fx ?? step.fx);
    const fx2Code = normalizeVoiceFxCode(step.fx2);
    const fx3Code = normalizePunchInFx3Code(step.fx3);
    const fx3Value = clampFxValue(step.fx3Value);

    const hasExplicitVoiceOff = !event && (fx1Code === 'OFF' || fx2Code === 'OFF');
    if (hasExplicitVoiceOff) {
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
    const slice =
      !event && step.sliceIndex !== undefined
        ? sliceRange(settings?.sliceMarkers ?? [], step.sliceIndex, buffer.length)
        : undefined;
    if (!event && step.sliceIndex !== undefined && !slice) {
      console.error(`[TrackerBridge] Missing or invalid slice ${step.sliceIndex} for ${padId}.`);
      return;
    }
    const eventStart =
      event ? Math.max(0, Math.min(buffer.length, event.sliceStartFrame)) : undefined;
    const eventEnd =
      event ? Math.max(0, Math.min(buffer.length, event.sliceEndFrame)) : undefined;
    if (event && (eventStart === undefined || eventEnd === undefined || eventEnd <= eventStart)) {
      console.error(`[TrackerBridge] Invalid recorded slice for ${padId}.`);
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
        const microOffset =
          typeof item.subTickOffset === 'number' && Number.isFinite(item.subTickOffset)
            ? Math.max(-8, Math.min(8, Math.round(item.subTickOffset)))
            : 0;
        const offsetSec = ((tick - startTick + microOffset / 8) * stepDuration) / 8;
        const tickFx1 = item.reset ? { code: 'OFF' as const } : toVoiceFxCommand(item.fx, item.fxValue);
        const tickFx2 = toVoiceFxCommand(item.fx2, item.fx2Value);
        const tickFx3Code = normalizePunchInFx3Code(item.fx3);
        const tickFx3Value = clampFxValue(item.fx3Value);

        if (item.pitch !== null || item.volume !== null || tickFx1 || tickFx2 || tickFx3Code) {
          modulation.push({
            offset: offsetSec,
            ...(item.pitch === null ? {} : { semitoneOffset: item.pitch }),
            ...(item.volume === null ? {} : { volume: item.volume / 127 }),
            ...(tickFx1 ? { fx: tickFx1 } : {}),
            ...(tickFx2 ? { fx2: tickFx2 } : {}),
            ...(tickFx3Code
              ? {
                  punchIn: {
                    code: tickFx3Code,
                    ...(tickFx3Value === undefined ? {} : { value: tickFx3Value }),
                  },
                }
              : {}),
          });
        }
      }
    }

    const rawVelocity = event?.velocity ?? step.velocity;
    const velocity =
      typeof rawVelocity === 'number' && Number.isFinite(rawVelocity)
        ? Math.max(0, Math.min(127, rawVelocity)) / 127
        : 1;
    const playbackMode = event?.playMode ?? settings?.playbackMode;
    const reverse = event?.isReversed === true || playbackMode === 'reverse';

    const fx1Cmd = toVoiceFxCommand(event?.fx ?? step.fx, event?.fxValue ?? step.fxValue);
    const fx2Cmd = !event ? toVoiceFxCommand(step.fx2, step.fx2Value) : undefined;
    const primaryVoiceFx: VoiceFxCommand | undefined =
      fx1Cmd && fx1Cmd.code !== 'OFF' ? fx1Cmd : fx2Cmd;

    const voiceId = audioEngine.triggerPad(padId, {
      sliceStart:
        eventStart !== undefined
          ? eventStart / buffer.sampleRate
          : slice
            ? slice.start / buffer.sampleRate
            : (startPct / 100) * buffer.duration,
      sliceEnd:
        eventEnd !== undefined
          ? eventEnd / buffer.sampleRate
          : slice
            ? slice.end / buffer.sampleRate
            : (endPct / 100) * buffer.duration,
      semitoneOffset: (settings?.pitch ?? 0) + noteOffset(note),
      volume: velocity,
      loop: playbackMode === 'loop',
      reverse,
      gated: playbackMode === 'gate',
      padVolume: padMetadata?.volume ?? 1,
      chokeGroup: padMetadata?.chokeGroup ?? null,
      chokeTrackRange: rmxScope,
      scheduledTime,
      trackIndex,
      modulation: modulation.length ? modulation : undefined,
      fx: primaryVoiceFx,
      ...(fx2Cmd && primaryVoiceFx !== fx2Cmd ? { fx2: fx2Cmd } : {}),
      ...(fx3Code
        ? {
            punchIn: {
              code: fx3Code,
              ...(fx3Value === undefined ? {} : { value: fx3Value }),
            },
          }
        : {}),
    });

    this.prunePending();
    if (voiceId) {
      this.pendingVoices.push({ voiceId, time: scheduledTime });
      if (table && table.steps.length) {
        this.tableVoices = this.tableVoices.filter((voice) => audioEngine.hasVoice(voice.voiceId));
        this.tableVoices.push({
          voiceId,
          time: Math.max(scheduledTime, now),
          tableId: table.id,
          pageIndex,
          startTick,
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
      if (
        voice.tableId !== tableId ||
        voice.pageIndex !== pageIndex ||
        context.currentTime < voice.time ||
        !audioEngine.isVoiceSounding(voice.voiceId)
      ) {
        continue;
      }
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