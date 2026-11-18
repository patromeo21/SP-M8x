/**
 * dspMath.ts — Precomputed, zero-allocation DSP curves for mobile Safari.
 * Curves are generated once and reused; playback-path helpers never allocate.
 */

/** Cache of tape saturation curves keyed by rounded drive amount. */
const tapeCurveCache = new Map<number, Float32Array<ArrayBuffer>>();
const TAPE_CURVE_SAMPLES = 2048; // Linear-interpolated lookups make 44.1k unnecessary.
export const SAFETY_CLAMP_LIMIT = 0.92;
const SAFETY_CURVE_SAMPLES = 44100;

/**
 * Asymmetric warm tape/vinyl saturation curve for a WaveShaperNode.
 * Output stays strictly below ±1 so downstream brickwall stages stay in control.
 */
export function makeTapeSaturationCurve(amount = 4.0): Float32Array<ArrayBuffer> {
  const drive = Math.min(20, Math.max(0, Number.isFinite(amount) ? amount : 4.0));
  const key = Math.round(drive * 10);
  const cached = tapeCurveCache.get(key);
  if (cached) return cached;

  const curve = new Float32Array(new ArrayBuffer(TAPE_CURVE_SAMPLES * 4));
  for (let i = 0; i < TAPE_CURVE_SAMPLES; ++i) {
    const x = (i * 2) / (TAPE_CURVE_SAMPLES - 1) - 1;
    const absX = Math.abs(x);
    // Asymmetric soft clip: rounds peaks and adds gentle even harmonics.
    let shaped = (x * (3 + drive * absX)) / (1 + (drive + 2) * absX * absX);
    shaped += 0.04 * x * x * Math.sign(x); // mild even-harmonic asymmetry
    curve[i] = Math.max(-1, Math.min(1, shaped));
  }
  tapeCurveCache.set(key, curve);
  return curve;
}

export function makeSafetyClampCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(SAFETY_CURVE_SAMPLES * 4));
  const kneeStart = 0.9;
  const kneeWidth = SAFETY_CLAMP_LIMIT - kneeStart;
  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2) / curve.length - 1;
    const magnitude = Math.abs(x);
    const shaped = magnitude <= kneeStart
      ? magnitude
      : kneeStart + kneeWidth * (1 - Math.exp(-(magnitude - kneeStart) / kneeWidth));
    curve[i] = Math.sign(x) * shaped;
  }
  return curve;
}

/** Zero-allocation linear interpolation. */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/** Clamp a value within bounds (defaults to audio-safe ±1). */
export function clampValue(val: number, min = -1, max = 1): number {
  return val < min ? min : val > max ? max : val;
}

export const DSPMath = {
  clamp(val: number, min: number, max: number): number {
    return clampValue(val, min, max);
  },

  dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  },

  linearToDb(linear: number): number {
    return 20 * Math.log10(Math.max(linear, 1e-5));
  },

  flushSubnormal(val: number): number {
    return Math.abs(val) < 1e-15 ? 0 : val;
  },
};
