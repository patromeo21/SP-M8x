export type VoiceFxCode = 'FL' | 'DL' | 'DR' | 'OFF';

export interface VoiceFxCommand {
  code: VoiceFxCode;
  value?: number;
}

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
    for (const param of [slot.voiceGain.gain, slot.padGain.gain, slot.panner.pan, slot.dryGain.gain,
      slot.wetGain.gain, slot.filter.frequency, slot.drive.gain, slot.delay.delayTime, slot.feedbackGain.gain]) {
      holdAudioParam(param, time);
    }
    slot.voiceGain.gain.setValueAtTime(1, time);
    slot.padGain.gain.setValueAtTime(1, time);
    slot.panner.pan.setValueAtTime(0, time);
    slot.dryGain.gain.setValueAtTime(1, time);
    slot.wetGain.gain.setValueAtTime(0, time);
    slot.feedbackGain.gain.setValueAtTime(0, time);
  }

  public reset(slot: VoiceFxSlot, time: number): void {
    for (const param of [slot.wetGain.gain, slot.feedbackGain.gain]) {
      holdAudioParam(param, time);
      param.exponentialRampToValueAtTime(0.0001, time + 0.008);
    }
  }

  public apply(slot: VoiceFxSlot, command: VoiceFxCommand, time: number): void {
    if (command.code === 'OFF') {
      this.reset(slot, time);
      return;
    }
    const value = Number.isFinite(command.value) ? Math.max(0, Math.min(127, command.value ?? 0)) / 127 : 0.5;
    for (const param of [slot.wetGain.gain, slot.filter.frequency, slot.drive.gain, slot.delay.delayTime, slot.feedbackGain.gain]) {
      holdAudioParam(param, time);
    }
    slot.filter.frequency.setTargetAtTime(command.code === 'FL' ? 18000 * Math.pow(0.01, value) : 20000, time, 0.005);
    slot.drive.gain.setTargetAtTime(command.code === 'DR' ? 1 + value * 8 : 1, time, 0.005);
    slot.delay.delayTime.setValueAtTime(command.code === 'DL' ? 0.375 : 0, time);
    slot.feedbackGain.gain.setTargetAtTime(command.code === 'DL' ? 0.1 + 0.7 * value : 0, time, 0.005);
    slot.wetGain.gain.setTargetAtTime(value, time, 0.005);
  }
}
