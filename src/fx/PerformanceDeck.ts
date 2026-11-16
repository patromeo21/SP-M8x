import { holdAudioParam } from './VoiceFxPool';

export type PerformanceFx = 'filter' | 'drive' | 'delay' | 'off';

export class PerformanceDeck {
  public readonly input: GainNode;
  private readonly dry: GainNode;
  private readonly filterWet: GainNode;
  private readonly driveWet: GainNode;
  private readonly delayWet: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly feedback: GainNode;

  constructor(private readonly context: AudioContext, output: AudioNode) {
    this.input = context.createGain();
    this.dry = context.createGain();
    this.filterWet = context.createGain();
    this.driveWet = context.createGain();
    this.delayWet = context.createGain();
    this.filter = context.createBiquadFilter();
    const drive = context.createGain();
    const shaper = context.createWaveShaper();
    const delay = context.createDelay(2);
    this.feedback = context.createGain();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((2 * i / (curve.length - 1) - 1) * 2);
    shaper.curve = curve;
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    drive.gain.value = 4;
    delay.delayTime.value = 0.25;
    this.feedback.gain.value = 0;
    this.dry.gain.value = 1;
    this.filterWet.gain.value = 0;
    this.driveWet.gain.value = 0;
    this.delayWet.gain.value = 0;
    this.input.connect(this.dry).connect(output);
    this.input.connect(this.filter).connect(this.filterWet).connect(output);
    this.input.connect(drive).connect(shaper).connect(this.driveWet).connect(output);
    this.input.connect(delay).connect(this.delayWet).connect(output);
    delay.connect(this.feedback).connect(delay);
  }

  public setEffect(effect: PerformanceFx): void {
    const now = this.context.currentTime;
    for (const param of [this.dry.gain, this.filterWet.gain, this.driveWet.gain, this.delayWet.gain, this.feedback.gain, this.filter.frequency]) {
      holdAudioParam(param, now);
    }
    if (effect === 'filter') this.filter.frequency.setTargetAtTime(350, now, 0.3);
    else this.filter.frequency.setTargetAtTime(20000, now, 0.1);
    this.feedback.gain.setTargetAtTime(effect === 'delay' ? 0.35 : 0, now, 0.002);
    this.dry.gain.setTargetAtTime(effect === 'filter' || effect === 'drive' ? 0 : 1, now, 0.002);
    this.filterWet.gain.setTargetAtTime(effect === 'filter' ? 1 : 0, now, 0.002);
    this.driveWet.gain.setTargetAtTime(effect === 'drive' ? 1 : 0, now, 0.002);
    this.delayWet.gain.setTargetAtTime(effect === 'delay' ? 0.4 : 0, now, 0.002);
  }
}
