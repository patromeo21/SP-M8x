/**
 * SP-M8x Hybrid Music Production Suite
 * fxEngine.ts — Punch-In Performance FX DSP Chain
 */

export type FXType = 'filter' | 'bitcrush' | 'delay' | 'none';

export class FXEngine {
  private ctx: AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;

  // Effect Nodes
  private filterNode: BiquadFilterNode;
  private delayNode: DelayNode;
  private delayFeedback: GainNode;
  private distortionNode: WaveShaperNode;
  
  private activeFx: FXType = 'none';

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.inputNode = this.ctx.createGain();
    this.outputNode = this.ctx.createGain();

    // Initialize Biquad Filter (Lowpass sweep)
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(20000, this.ctx.currentTime);
    this.filterNode.Q.setValueAtTime(4, this.ctx.currentTime);

    // Initialize Delay (Throw effect)
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(0.375, this.ctx.currentTime); // dotted 8th note feel
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);

    // Initialize Distortion / Bitcrush simulator via WaveShaper
    this.distortionNode = this.ctx.createWaveShaper();
    this.distortionNode.curve = this.makeDistortionCurve(0) as unknown as Float32Array<ArrayBuffer>;

    // Wire default dry path: Input -> Output
    this.inputNode.connect(this.outputNode);
    this.outputNode.connect(destination);
  }

  public getInputNode(): AudioNode {
    return this.inputNode;
  }

  public setEffect(fx: FXType, intensity: number = 0.5): void {
    const now = this.ctx.currentTime;
    // Disconnect current routing
    this.inputNode.disconnect();

    if (fx === 'filter') {
      // Sweep cutoff from 200Hz to 18kHz based on intensity
      const freq = 200 + intensity * 17800;
      this.filterNode.frequency.setTargetAtTime(freq, now, 0.02);
      this.inputNode.connect(this.filterNode);
      this.filterNode.connect(this.outputNode);
    } else if (fx === 'bitcrush') {
      this.distortionNode.curve = this.makeDistortionCurve(intensity * 50) as unknown as Float32Array<ArrayBuffer>;
      this.inputNode.connect(this.distortionNode);
      this.distortionNode.connect(this.outputNode);
    } else if (fx === 'delay') {
      this.inputNode.connect(this.delayNode);
      this.delayNode.connect(this.outputNode);
      this.inputNode.connect(this.outputNode); // Dry + Wet
    } else {
      // Bypass
      this.inputNode.connect(this.outputNode);
    }

    this.activeFx = fx;
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
}