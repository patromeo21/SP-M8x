export class ResamplingCaptureEngine {
  private sampleRate: number;
  private maxSeconds: number = 30;
  private channels: number = 2;
  private capacitySamples: number;
  private bufferLeft: Float32Array;
  private bufferRight: Float32Array;
  private writeHead: number = 0;
  private isRecording: boolean = false;
  private capturedSamples = 0;
  private released = false;

  constructor(sampleRate: number = 44100) {
    if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
      throw new RangeError('Sample rate must be a positive safe integer.');
    }
    this.sampleRate = sampleRate;
    this.capacitySamples = this.sampleRate * this.maxSeconds;
    this.bufferLeft = new Float32Array(this.capacitySamples);
    this.bufferRight = new Float32Array(this.capacitySamples);
  }

  public startCapture() {
    if (this.released) throw new Error('Capture engine has been released.');
    this.writeHead = 0;
    this.capturedSamples = 0;
    this.isRecording = true;
  }

  // Push raw PCM frames from audio thread tap
  public pushFrame(left: number, right: number) {
    if (!this.isRecording || this.released) return;
    this.bufferLeft[this.writeHead] = left;
    this.bufferRight[this.writeHead] = right;
    this.writeHead = (this.writeHead + 1) % this.capacitySamples;
    this.capturedSamples = Math.min(this.capacitySamples, this.capturedSamples + 1);
  }

  public stopAndExtractBounce(
    audioCtx: BaseAudioContext,
    bpm: number,
    bars: 1 | 2 | 4 | 8
  ): AudioBuffer {
    if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM must be a positive finite number.');
    if (bars !== 1 && bars !== 2 && bars !== 4 && bars !== 8) {
      throw new RangeError('Bounce length must be 1, 2, 4, or 8 bars.');
    }
    if (this.released) throw new Error('Capture engine has been released.');
    this.isRecording = false;

    // Calculate exact sample length for N bars (4/4 time signature)
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * 4;
    const targetSamples = Math.min(
      Math.round(secondsPerBar * bars * this.sampleRate),
      this.capacitySamples
    );
    const extractedSamples = Math.min(targetSamples, this.capturedSamples);
    if (extractedSamples <= 0) throw new Error('Cannot bounce before any samples have been captured.');

    const extracted = audioCtx.createBuffer(this.channels, extractedSamples, this.sampleRate);
    const destLeft = extracted.getChannelData(0);
    const destRight = extracted.getChannelData(1);

    let readIndex = (this.writeHead - extractedSamples + this.capacitySamples) % this.capacitySamples;

    for (let i = 0; i < extractedSamples; i++) {
      destLeft[i] = this.bufferLeft[readIndex];
      destRight[i] = this.bufferRight[readIndex];
      readIndex = (readIndex + 1) % this.capacitySamples;
    }

    return extracted;
  }

  public release() {
    this.released = true;
    this.bufferLeft = new Float32Array(0);
    this.bufferRight = new Float32Array(0);
    this.isRecording = false;
    this.capacitySamples = 0;
    this.capturedSamples = 0;
    this.writeHead = 0;
  }
}