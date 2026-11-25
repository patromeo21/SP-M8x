/**
 * SP-M8x Hybrid Music Production Suite
 * fx/VoiceFxPool.ts — Voice/subtick effect management pool (FX1 / FX2)
 */

export type VoiceFxCode = 'FL' | 'DL' | 'PS' | 'OFF';

export interface VoiceFxCommand {
  code: VoiceFxCode;
  value?: number;
}

export type TableOpcode = VoiceFxCommand;

export interface VoiceFxSlot {
  voiceGain: GainNode;
  padGain: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  trackGain: GainNode;
  deckGains: [GainNode, GainNode];
  panner: StereoPannerNode;
  filter: BiquadFilterNode;
  delay: DelayNode;
  feedbackGain: GainNode;
  generationId: number;
  padId: string | null;
}

const MIN_DELAY_SECONDS = 0.0625;
const MAX_DELAY_SECONDS = 0.75;
const MAX_FEEDBACK_GAIN = 0.72;
const MIN_FL_CUTOFF_HZ = 120;
const MAX_FL_CUTOFF_HZ = 18000;
const MIN_FL_DRY_GAIN = 0.15;
const OPCODE_RAMP_TC = 0.004;

export function holdAudioParam(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else param.setValueAtTime(param.value, time);
}

/**
 * Retires legacy 'DR' to 'OFF' and normalizes unknown/non-canonical codes to 'OFF'.
 */
export function sanitizeVoiceFxCode(raw: unknown): VoiceFxCode {
  if (raw === 'FL' || raw === 'DL' || raw === 'PS' || raw === 'OFF') return raw;
  return 'OFF';
}

function normalizeOpcodeValue(rawValue: number | undefined): number {
  if (!Number.isFinite(rawValue)) return 0.5;
  return Math.max(0, Math.min(127, rawValue ?? 0)) / 127;
}

export function applyVoiceFilter(
  filterNode: BiquadFilterNode,
  bipolarValue: number,
  resonance: number = 1.0,
  time: number = filterNode.context.currentTime,
): void {
  if (!Number.isFinite(bipolarValue) || !Number.isFinite(resonance) || !Number.isFinite(time) || time < 0) {
    throw new RangeError('Voice filter value, resonance, and time must be finite.');
  }
  const clampedValue = Math.max(-1, Math.min(1, bipolarValue));
  const clampedQ = Math.max(0.1, Math.min(20, resonance));
  const rampTime = 0.015;

  if (Math.abs(clampedValue) < 0.01) {
    filterNode.type = 'lowpass';
    holdAudioParam(filterNode.frequency, time);
    holdAudioParam(filterNode.Q, time);
    filterNode.frequency.setTargetAtTime(20000, time, rampTime);
    filterNode.Q.setTargetAtTime(1.0, time, rampTime);
    return;
  }

  holdAudioParam(filterNode.frequency, time);
  holdAudioParam(filterNode.Q, time);

  if (clampedValue < 0) {
    filterNode.type = 'lowpass';
    const cutoff = 20 + Math.pow(1 + clampedValue, 2) * 19980;
    filterNode.frequency.setTargetAtTime(Math.max(20, Math.min(20000, cutoff)), time, rampTime);
  } else {
    filterNode.type = 'highpass';
    const cutoff = 20 + Math.pow(clampedValue, 2) * 9980;
    filterNode.frequency.setTargetAtTime(Math.max(20, Math.min(10000, cutoff)), time, rampTime);
  }

  filterNode.Q.setTargetAtTime(clampedQ, time, rampTime);
}

export class VoiceFxPool {
  public readonly slots: VoiceFxSlot[];

  constructor(context: AudioContext, destinations: [AudioNode, AudioNode]) {
    this.slots = Array.from({ length: 32 }, () => {
      const voiceGain = context.createGain();
      const padGain = context.createGain();
      const panner = context.createStereoPanner();
      const dryGain = context.createGain();
      const wetGain = context.createGain();
      const trackGain = context.createGain();
      const deckGains: [GainNode, GainNode] = [context.createGain(), context.createGain()];
      const filter = context.createBiquadFilter();
      const shaper = context.createWaveShaper();
      const delay = context.createDelay(2);
      const feedbackGain = context.createGain();

      filter.type = 'lowpass';
      filter.frequency.value = 20000;

      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) {
        const x = (2 * i) / (curve.length - 1) - 1;
        const magnitude = Math.abs(x);
        curve[i] = magnitude <= 0.7 ? magnitude : 0.7 + 0.3 * Math.tanh((magnitude - 0.7) / 0.3);
      }
      shaper.curve = curve;

      delay.delayTime.value = 0.375;
      feedbackGain.gain.value = 0;
      dryGain.gain.value = 1;
      wetGain.gain.value = 0;

      voiceGain.connect(padGain);
      padGain.connect(panner);
      panner.connect(dryGain).connect(trackGain);
      panner.connect(filter).connect(shaper).connect(delay).connect(wetGain).connect(trackGain);
      trackGain.connect(deckGains[0]).connect(destinations[0]);
      trackGain.connect(deckGains[1]).connect(destinations[1]);
      delay.connect(feedbackGain).connect(delay);

      return {
        voiceGain,
        padGain,
        panner,
        dryGain,
        wetGain,
        trackGain,
        deckGains,
        filter,
        delay,
        feedbackGain,
        generationId: 0,
        padId: null,
      };
    });
  }

  public prepare(slot: VoiceFxSlot, time: number, padId: string): void {
    slot.generationId++;
    slot.padId = padId;
    holdAudioParam(slot.voiceGain.gain, time);
    holdAudioParam(slot.padGain.gain, time);
    holdAudioParam(slot.panner.pan, time);
    holdAudioParam(slot.dryGain.gain, time);
    holdAudioParam(slot.wetGain.gain, time);
    holdAudioParam(slot.filter.frequency, time);
    holdAudioParam(slot.delay.delayTime, time);
    holdAudioParam(slot.feedbackGain.gain, time);

    slot.panner.pan.setValueAtTime(0, time);
    slot.filter.type = 'lowpass';
    slot.filter.frequency.setTargetAtTime(20000, time, OPCODE_RAMP_TC);
    slot.delay.delayTime.setValueAtTime(0.375, time);
    slot.feedbackGain.gain.setTargetAtTime(0, time, OPCODE_RAMP_TC);
    slot.dryGain.gain.setTargetAtTime(1, time, OPCODE_RAMP_TC);
    slot.wetGain.gain.setTargetAtTime(0, time, OPCODE_RAMP_TC);
  }

  public apply(slot: VoiceFxSlot, command: VoiceFxCommand, time: number): void {
    this.applyTableOpcode(slot, command, time);
  }

  public applyTableOpcode(slot: VoiceFxSlot, command: TableOpcode, time: number): void {
    if (!Number.isFinite(time) || time < 0) {
      throw new RangeError('Table opcode time must be finite and non-negative.');
    }
    const safeCode = sanitizeVoiceFxCode(command.code);
    if (safeCode === 'PS') return;
    if (safeCode === 'OFF') {
      this.reset(slot, time);
      return;
    }

    const norm = normalizeOpcodeValue(command.value);

    if (safeCode === 'FL') {
      const cutoffHz = Math.max(
        20,
        Math.min(20000, MAX_FL_CUTOFF_HZ * Math.pow(MIN_FL_CUTOFF_HZ / MAX_FL_CUTOFF_HZ, norm)),
      );
      const wetAmount = Math.max(0, Math.min(1, norm));
      const dryAmount = Math.max(MIN_FL_DRY_GAIN, Math.min(1, 1 - norm * (1 - MIN_FL_DRY_GAIN)));
      holdAudioParam(slot.filter.frequency, time);
      holdAudioParam(slot.feedbackGain.gain, time);
      holdAudioParam(slot.dryGain.gain, time);
      holdAudioParam(slot.wetGain.gain, time);
      slot.filter.frequency.setTargetAtTime(cutoffHz, time, OPCODE_RAMP_TC);
      slot.feedbackGain.gain.setTargetAtTime(0, time, OPCODE_RAMP_TC);
      slot.dryGain.gain.setTargetAtTime(dryAmount, time, OPCODE_RAMP_TC);
      slot.wetGain.gain.setTargetAtTime(wetAmount, time, OPCODE_RAMP_TC);
      return;
    }

    if (safeCode === 'DL') {
      const delayTimeSec = Math.max(
        MIN_DELAY_SECONDS,
        Math.min(MAX_DELAY_SECONDS, MIN_DELAY_SECONDS + norm * (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS)),
      );
      const feedbackAmount = Math.max(0, Math.min(MAX_FEEDBACK_GAIN, 0.1 + norm * 0.62));
      const wetAmount = Math.max(0, Math.min(1, 0.15 + norm * 0.7));
      holdAudioParam(slot.filter.frequency, time);
      holdAudioParam(slot.dryGain.gain, time);
      holdAudioParam(slot.delay.delayTime, time);
      holdAudioParam(slot.feedbackGain.gain, time);
      holdAudioParam(slot.wetGain.gain, time);
      slot.filter.frequency.setTargetAtTime(20000, time, OPCODE_RAMP_TC);
      slot.dryGain.gain.setTargetAtTime(1, time, OPCODE_RAMP_TC);
      slot.delay.delayTime.setValueAtTime(delayTimeSec, time);
      slot.feedbackGain.gain.setTargetAtTime(feedbackAmount, time, OPCODE_RAMP_TC);
      slot.wetGain.gain.setTargetAtTime(wetAmount, time, OPCODE_RAMP_TC);
    }
  }

  public reset(slot: VoiceFxSlot, time: number): void {
    holdAudioParam(slot.dryGain.gain, time);
    holdAudioParam(slot.wetGain.gain, time);
    holdAudioParam(slot.feedbackGain.gain, time);
    slot.dryGain.gain.setTargetAtTime(1, time, 0.008);
    slot.wetGain.gain.setTargetAtTime(0, time, 0.008);
    slot.feedbackGain.gain.setTargetAtTime(0, time, 0.008);
  }
}