export interface PsFxCommand {
  code: string;
  value?: number;
}

export interface PsModulationChange {
  offset: number;
  semitoneOffset?: number;
  fx?: PsFxCommand;
}

export interface PsRateChange {
  time: number;
  rate: number;
}

export interface PsPlaybackSource {
  playbackRate: AudioParam;
}

export interface SchedulePsModulationOptions {
  source: PsPlaybackSource;
  modulation: readonly PsModulationChange[];
  semitones: number;
  targetGainTime: number;
  duration: number;
  rateChanges?: PsRateChange[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function semitonesToRate(semitonesValue: number): number {
  return Math.pow(2, clamp(semitonesValue, -48, 48) / 12);
}

/**
 * Schedules Pitch Slide (`PS`) playbackRate automation onto a voice source while
 * recording rate changes in chronological order.
 */
export function schedulePsModulation({
  source,
  modulation,
  semitones,
  targetGainTime,
  duration,
  rateChanges = [],
}: SchedulePsModulationOptions): PsRateChange[] {
  const safeStartBase = Number.isFinite(targetGainTime) ? targetGainTime : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const baseSemitones = Number.isFinite(semitones) ? semitones : 0;

  modulation.forEach((change, index) => {
    if (change.fx?.code !== 'PS') return;

    const time = safeStartBase + (Number.isFinite(change.offset) ? change.offset : 0);
    const slideSemitones = clamp(change.fx.value ?? 0, -24, 24);
    const slideRate = semitonesToRate(baseSemitones + (change.semitoneOffset ?? 0) + slideSemitones);

    source.playbackRate.setValueAtTime(slideRate, time);
    rateChanges.push({ time, rate: slideRate });

    const nextChange = modulation[index + 1];
    if (nextChange && Number.isFinite(nextChange.offset) && nextChange.offset > change.offset) {
      const nextTime = safeStartBase + nextChange.offset;
      const nextSlideSemitones = nextChange.fx?.code === 'PS'
        ? clamp(nextChange.fx.value ?? 0, -24, 24)
        : 0;
      const nextRate = semitonesToRate(baseSemitones + (nextChange.semitoneOffset ?? 0) + nextSlideSemitones);
      source.playbackRate.linearRampToValueAtTime(nextRate, nextTime);
      rateChanges.push({ time: nextTime, rate: nextRate });
    } else {
      const fallbackEndTime = Math.min(safeStartBase + safeDuration, time + 0.125);
      if (fallbackEndTime > time) {
        source.playbackRate.linearRampToValueAtTime(slideRate, fallbackEndTime);
        rateChanges.push({ time: fallbackEndTime, rate: slideRate });
      }
    }
  });

  return rateChanges;
}

export default schedulePsModulation;