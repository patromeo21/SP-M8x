export type PerformanceFxType = 'beatRepeat' | 'tapeBrake' | 'djIsolator';

export class PerformanceFxManager {
  private audioCtx: BaseAudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;

  // FX Nodes
  private repeatDelayNode: DelayNode;
  private repeatFeedbackNode: GainNode;
  private isolatorFilter: BiquadFilterNode;
  private isHolding: boolean = false;

  constructor(audioCtx: BaseAudioContext) {
    this.audioCtx = audioCtx;
    this.inputNode = audioCtx.createGain();
    this.outputNode = audioCtx.createGain();

    // Setup Delay for Beat Repeat
    this.repeatDelayNode = audioCtx.createDelay(1.0);
    this.repeatFeedbackNode = audioCtx.createGain();
    this.repeatFeedbackNode.gain.value = 0.0; // Bypassed by default
    this.repeatDelayNode.connect(this.repeatFeedbackNode);
    this.repeatFeedbackNode.connect(this.repeatDelayNode);

    // Setup Biquad Filter for DJ Isolator
    this.isolatorFilter = audioCtx.createBiquadFilter();
    this.isolatorFilter.type = 'lowpass';
    this.isolatorFilter.frequency.value = 20000;
    this.isolatorFilter.Q.value = 1.0;

    // Route dry path by default
    this.inputNode.connect(this.outputNode);
  }

  public connect(destination: AudioNode) {
    this.outputNode.connect(destination);
  }

  public getNodeInput(): AudioNode {
    return this.inputNode;
  }

  public triggerFxOn(type: PerformanceFxType, paramValue: number = 0.5) {
    if (this.isHolding) return;
    this.isHolding = true;
    const now = this.audioCtx.currentTime;

    switch (type) {
      case 'beatRepeat':
        // paramValue maps to subdivision (e.g. 1/8 note = 0.125s)
        this.repeatDelayNode.delayTime.setValueAtTime(Math.max(0.05, paramValue), now);
        this.repeatFeedbackNode.gain.setValueAtTime(0.75, now); // Clamped safely below 0.92
        this.inputNode.disconnect();
        this.inputNode.connect(this.repeatDelayNode);
        this.repeatDelayNode.connect(this.outputNode);
        break;

      case 'tapeBrake':
        // Exponential slowdown simulation via playback rate / gain ramp
        this.outputNode.gain.setTargetAtTime(0.0, now, 0.25);
        break;

      case 'djIsolator':
        // paramValue 0.0 = full LPF sweep, 1.0 = full HPF sweep
        this.inputNode.disconnect();
        this.inputNode.connect(this.isolatorFilter);
        this.isolatorFilter.connect(this.outputNode);

        if (paramValue < 0.5) {
          this.isolatorFilter.type = 'lowpass';
          const freq = 20 + Math.pow(paramValue * 2, 2) * 19980;
          this.isolatorFilter.frequency.setTargetAtTime(freq, now, 0.02);
        } else {
          this.isolatorFilter.type = 'highpass';
          const freq = 20 + Math.pow((paramValue - 0.5) * 2, 2) * 9980;
          this.isolatorFilter.frequency.setTargetAtTime(freq, now, 0.02);
        }
        break;
    }
  }

  public triggerFxOff() {
    if (!this.isHolding) return;
    this.isHolding = false;
    const now = this.audioCtx.currentTime;

    // Reset routing and parameters cleanly to dry state
    try {
      this.inputNode.disconnect();
    } catch {}

    this.repeatFeedbackNode.gain.setValueAtTime(0.0, now);
    this.outputNode.gain.setValueAtTime(1.0, now);
    this.isolatorFilter.frequency.setValueAtTime(20000, now);

    // Restore direct dry connection
    this.inputNode.connect(this.outputNode);
  }
}