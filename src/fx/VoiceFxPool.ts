export type VoiceFxCode = 'FL' | 'DL' | 'DR' | 'PS' | 'OFF';

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
  drive: GainNode;
  delay: DelayNode;
  feedbackGain: GainNode;
  generationId: number;
  padId: string | null;
}

export function holdAudioParam(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else param.setValueAtTime(param.value, time);
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
      const drive = context.createGain();
      const shaper = context.createWaveShaper();
      const delay = context.createDelay(2);
      const feedbackGain = context.createGain();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) {
        const x = 2 * i / (curve.length - 1) - 1;
        const magnitude = Math.abs(x);
        curve[i] = Math.sign(x) * (magnitude <= 0.7 ? magnitude : 0.7 + 0.3 * Math.tanh((magnitude - 0.7) / 0.3));
      }
      shaper.curve = curve;
      delay.delayTime.value = 0.375;
      feedbackGain.gain.value = 0;
      dryGain.gain.value = 1;
      wetGain.gain.value = 0;
      voiceGain.connect(padGain);
      padGain.connect(panner);
      panner.connect(dryGain).connect(trackGain);
      panner.connect(filter).connect(drive).connect(shaper).connect(delay).connect(wetGain).connect(trackGain);
      trackGain.connect(deckGains[0]).connect(destinations[0]);
      trackGain.connect(deckGains[1]).connect(destinations[1]);
      delay.connect(feedbackGain).connect(delay);
      return { voiceGain, padGain, panner, dryGain, wetGain, trackGain, deckGains, filter, drive, delay, feedbackGain, generationId: 0, padId: null };
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
    holdAudioParam(slot.drive.gain, time);
    holdAudioParam(slot.delay.delayTime, time);
    holdAudioParam(slot.feedbackGain.gain, time);
    slot.voiceGain.gain.setValueAtTime(1, time);
    slot.padGain.gain.setValueAtTime(1, time);
    slot.panner.pan.setValueAtTime(0, time);
    slot.dryGain.gain.setValueAtTime(1, time);
    slot.wetGain.gain.setValueAtTime(0, time);
    slot.feedbackGain.gain.setValueAtTime(0, time);
  }

  public reset(slot: VoiceFxSlot, time: number): void {
    holdAudioParam(slot.wetGain.gain, time);
    holdAudioParam(slot.feedbackGain.gain, time);
    slot.wetGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.008);
    slot.feedbackGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.008);
  }

  public apply(slot: VoiceFxSlot, command: VoiceFxCommand, time: number): void {
    this.applyTableOpcode(slot, command, time);
  }

  public applyTableOpcode(slot: VoiceFxSlot, command: TableOpcode, time: number): void {
    if (!Number.isFinite(time) || time < 0) throw new RangeError('Table opcode time must be finite and non-negative.');
    if (command.code === 'PS') return;
    if (command.code === 'OFF') {
      this.reset(slot, time);
      return;
    }
    const value = Number.isFinite(command.value) ? Math.max(0, Math.min(127, command.value ?? 0)) / 127 : 0.5;
    holdAudioParam(slot.wetGain.gain, time);
    holdAudioParam(slot.filter.frequency, time);
    holdAudioParam(slot.drive.gain, time);
    holdAudioParam(slot.delay.delayTime, time);
    holdAudioParam(slot.feedbackGain.gain, time);
    slot.filter.frequency.setTargetAtTime(command.code === 'FL' ? 18000 * Math.pow(0.01, value) : 20000, time, 0.005);
    slot.drive.gain.setTargetAtTime(command.code === 'DR' ? 1 + value * 8 : 1, time, 0.005);
    slot.delay.delayTime.setValueAtTime(command.code === 'DL' ? 0.375 : 0, time);
    slot.feedbackGain.gain.setTargetAtTime(command.code === 'DL' ? 0.1 + 0.7 * value : 0, time, 0.005);
    slot.wetGain.gain.setTargetAtTime(value, time, 0.005);
  }
}

/**
 * Bipolar LPF/HPF parameter ramp with de-zippering AudioParam ramps.
 * Maps -1.0 (full lowpass) to +1.0 (full highpass), 0.0 = bypass/neutral.
 * Safe for voice filter application during performance playback.
 */
export function applyVoiceFilter(
  filterNode: BiquadFilterNode,
  audioCtx: BaseAudioContext,
  bipolarValue: number,
  resonance: number = 1.0,
  time: number = audioCtx.currentTime
): void {
  if (!Number.isFinite(bipolarValue) || !Number.isFinite(resonance) ||
      !Number.isFinite(time) || time < 0) {
    throw new RangeError('Voice filter value, resonance, and time must be finite.');
  }
  bipolarValue = Math.max(-1, Math.min(1, bipolarValue));
  resonance = Math.max(0.1, Math.min(20, resonance));
  const rampTime = 0.015; // 15ms de-zippering ramp

  if (Math.abs(bipolarValue) < 0.01) {
    // Neutral: set to lowpass at max frequency (open filter)
    filterNode.type = 'lowpass';
    filterNode.frequency.setTargetAtTime(20000, time, rampTime);
    filterNode.Q.setTargetAtTime(1.0, time, rampTime);
    return;
  }

  if (bipolarValue < 0) {
    // Negative range (-1 to 0): Lowpass sweep from 20Hz to 20,000Hz
    filterNode.type = 'lowpass';
    const cutoff = 20 + Math.pow(1 + bipolarValue, 2) * 19980;
    filterNode.frequency.setTargetAtTime(Math.max(20, Math.min(20000, cutoff)), time, rampTime);
  } else {
    // Positive range (0 to +1): Highpass sweep from 20Hz to 10,000Hz
    filterNode.type = 'highpass';
    const cutoff = 20 + Math.pow(bipolarValue, 2) * 9980;
    filterNode.frequency.setTargetAtTime(Math.max(20, Math.min(10000, cutoff)), time, rampTime);
  }

  filterNode.Q.setTargetAtTime(Math.max(0.1, Math.min(20.0, resonance)), time, rampTime);
}
