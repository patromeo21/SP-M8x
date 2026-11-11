/**
 * SP-M8x Hybrid Music Production Suite
 * fxEngine.ts — Punch-In Performance FX DSP Chain & Master Controls
 */

export type FXType = 'filter' | 'bitcrush' | 'delay' | 'none';

export class FXEngine {
  private ctx: AudioContext | null = null;
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;

  // Effect Nodes
  private filterNode: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private distortionNode: WaveShaperNode | null = null;
  
  private activeFx: FXType = 'none';
  private masterVolumeValue: number = 0.8;
  private filterCutoffValue: number = 20000;
  private bitCrushDepthValue: number = 16;

  constructor() {
    // Lazy initialization on audio context start
  }

  public initialize(ctx: AudioContext, destination: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;

    this.inputNode = this.ctx.createGain();
    this.outputNode = this.ctx.createGain();

    // Initialize Biquad Filter (Lowpass sweep)
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(this.filterCutoffValue, this.ctx.currentTime);
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

    // Wire default dry path: Input -> Output -> Destination
    this.inputNode.connect(this.outputNode);
    this.outputNode.gain.setValueAtTime(this.masterVolumeValue, this.ctx.currentTime);
    this.outputNode.connect(destination);
  }

  public getInputNode(): AudioNode | null {
    return this.inputNode;
  }

  public setMasterVolume(volume: number): void {
    this.masterVolumeValue = Math.max(0, Math.min(1, volume));
    if (this.outputNode && this.ctx) {
      this.outputNode.gain.setTargetAtTime(this.masterVolumeValue, this.ctx.currentTime, 0.01);
    }
  }

  public setFilterCutoff(cutoff: number): void {
    this.filterCutoffValue = Math.max(100, Math.min(20000, cutoff));
    if (this.filterNode && this.ctx) {
      this.filterNode.frequency.setTargetAtTime(this.filterCutoffValue, this.ctx.currentTime, 0.01);
    }
  }

  public setBitCrushDepth(depth: number): void {
    this.bitCrushDepthValue = Math.max(4, Math.min(16, depth));
    // Map bit depth (4-16) to a distortion amount curve
    const intensity = (16 - this.bitCrushDepthValue) * 3.5;
    if (this.distortionNode && this.ctx) {
      this.distortionNode.curve = this.makeDistortionCurve(intensity) as unknown as Float32Array<ArrayBuffer>;
    }
  }

  public setEffect(fx: FXType, intensity: number = 0.5): void {
    if (!this.ctx || !this.inputNode || !this.outputNode) return;
    const now = this.ctx.currentTime;
    
    this.inputNode.disconnect();

    if (fx === 'filter' && this.filterNode) {
      const freq = 200 + intensity * 17800;
      this.setFilterCutoff(freq);
      this.inputNode.connect(this.filterNode);
      this.filterNode.connect(this.outputNode);
    } else if (fx === 'bitcrush' && this.distortionNode) {
      this.inputNode.connect(this.distortionNode);
      this.distortionNode.connect(this.outputNode);
    } else if (fx === 'delay' && this.delayNode) {
      this.inputNode.connect(this.delayNode);
      this.delayNode.connect(this.outputNode);
      this.inputNode.connect(this.outputNode); // Dry + Wet
    } else {
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

export const fxEngine = new FXEngine();
export default fxEngine;