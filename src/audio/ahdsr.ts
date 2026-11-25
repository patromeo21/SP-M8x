/**
 * ahdsr.ts — Pure AHDSR envelope scheduling onto an AudioParam.
 * Kept free of Web Audio node imports so it can be unit tested directly.
 */

export interface AHDSRParams {
  attackTime: number;   // seconds
  holdTime: number;     // seconds
  decayTime: number;    // seconds
  sustainLevel: number; // 0.0 to 1.0
  releaseTime: number;  // seconds
}

export const DEFAULT_AHDSR_PARAMS: Readonly<AHDSRParams> = Object.freeze({
  attackTime: 0.002,
  holdTime: 0,
  decayTime: 0.08,
  sustainLevel: 1,
  releaseTime: 0.03,
});

export function createDefaultAHDSRParams(): AHDSRParams {
  return { ...DEFAULT_AHDSR_PARAMS };
}

export function validateAHDSR(params: AHDSRParams): void {
  if (!params || typeof params !== 'object') {
    throw new Error('Invalid AHDSR envelope parameters.');
  }
  const finite = (v: number) => Number.isFinite(v) && v >= 0;
  if (
    !finite(params.attackTime) ||
    !finite(params.holdTime) ||
    !finite(params.decayTime) ||
    !finite(params.releaseTime) ||
    !Number.isFinite(params.sustainLevel) ||
    params.sustainLevel < 0 ||
    params.sustainLevel > 1
  ) {
    throw new Error('Invalid AHDSR envelope parameters.');
  }
}

export function normalizeAHDSR(raw?: Partial<AHDSRParams> | null): AHDSRParams {
  const finiteOrDefault = (value: unknown, fallback: number, min = 0): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(min, value);
  };
  const sustainOrDefault = (value: unknown, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
  };
  return {
    attackTime: finiteOrDefault(raw?.attackTime, DEFAULT_AHDSR_PARAMS.attackTime),
    holdTime: finiteOrDefault(raw?.holdTime, DEFAULT_AHDSR_PARAMS.holdTime),
    decayTime: finiteOrDefault(raw?.decayTime, DEFAULT_AHDSR_PARAMS.decayTime),
    sustainLevel: sustainOrDefault(raw?.sustainLevel, DEFAULT_AHDSR_PARAMS.sustainLevel),
    releaseTime: finiteOrDefault(raw?.releaseTime, DEFAULT_AHDSR_PARAMS.releaseTime),
  };
}

export function oscillationValue(timeSeconds: number, frequencyHz: number, phaseRadians = 0): number {
  if (
    !Number.isFinite(timeSeconds) ||
    timeSeconds < 0 ||
    !Number.isFinite(frequencyHz) ||
    frequencyHz < 0 ||
    !Number.isFinite(phaseRadians)
  ) {
    throw new RangeError('Oscillation time, frequency, and phase must be finite and non-negative where applicable.');
  }
  return Math.sin(2 * Math.PI * frequencyHz * timeSeconds + phaseRadians);
}

/**
 * Schedules Attack/Hold/Decay/Sustain onto a gain param using AudioParam automation.
 * Peak is scaled by `peak`; the release stage is applied later when the voice is stopped.
 */
export function scheduleAHDSR(
  gainParam: AudioParam,
  startTime: number,
  peak: number,
  params: AHDSRParams,
): void {
  validateAHDSR(params);
  if (!Number.isFinite(startTime) || startTime < 0 || !Number.isFinite(peak) || peak < 0 || peak > 1) {
    throw new Error('Invalid AHDSR start time or peak level.');
  }
  const attackEnd = startTime + Math.max(0.001, params.attackTime);
  const holdEnd = attackEnd + params.holdTime;
  const decayEnd = holdEnd + Math.max(0.001, params.decayTime);
  const sustain = Math.max(0.0001, peak * params.sustainLevel);
  gainParam.cancelScheduledValues(startTime);
  gainParam.setValueAtTime(0.0001, startTime);
  gainParam.linearRampToValueAtTime(peak, attackEnd);
  if (params.holdTime > 0) gainParam.setValueAtTime(peak, holdEnd);
  gainParam.linearRampToValueAtTime(sustain, decayEnd);
}