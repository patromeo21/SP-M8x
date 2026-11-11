/**
 * SP-M8x FX Engine
 * fxEngine.ts — Web Audio DSP processing chain for Punch-In FX and Master Buss
 */

import { PunchInFXState, MasterFXState } from '../types';

class FXEngine {
  private ctx: AudioContext | null = null;
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;

  // Punch-In FX Nodes
  private filterNode: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;

  constructor() {
    // Initialized lazily via audioEngine context
  }

  public init(context: AudioContext, destinationNode: AudioNode): AudioNode {
    this.ctx = context;

    // Create primary biquad filter
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000;
    this.filterNode.Q.value = 1.0;

    // Create delay and feedback nodes
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.375; // Default dotted 8th or similar musical timing
    this.delayFeedbackGain = this.ctx.createGain();
    this.delayFeedbackGain.gain.value = 0.3;

    // Route delay loop
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);

    // Create master dynamics compressor / limiter
    this.compressorNode = this.ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -12;
    this.compressorNode.ratio.value = 4;

    // Input / Output gain wrappers
    this.inputNode = this.ctx.createGain();
    this.outputNode = this.ctx.createGain();

    // Chain: Input -> Filter -> Compressor -> Destination
    this.inputNode.connect(this.filterNode);
    this.filterNode.connect(this.compressorNode);
    this.compressorNode.connect(this.outputNode);
    this.outputNode.connect(destinationNode);

    return this.inputNode;
  }

  public updatePunchInFX(state: PunchInFXState): void {
    if (!this.ctx || !this.filterNode || !this.delayFeedbackGain) return;
    const now = this.ctx.currentTime;

    // Update Filter Cutoff and Resonance smoothly
    this.filterNode.frequency.setTargetAtTime(state.filterCutoff, now, 0.02);
    this.filterNode.Q.setTargetAtTime(state.filterResonance, now, 0.02);

    // Update Delay feedback
    this.delayFeedbackGain.gain.setTargetAtTime(state.delayFeedback, now, 0.02);
  }

  public updateMasterFX(state: MasterFXState): void {
    if (!this.ctx || !this.compressorNode) return;
    const now = this.ctx.currentTime;

    this.compressorNode.threshold.setTargetAtTime(state.limiterThreshold, now, 0.02);
    this.compressorNode.ratio.setTargetAtTime(state.compressorRatio, now, 0.02);
  }
}

export const fxEngine = new FXEngine();
