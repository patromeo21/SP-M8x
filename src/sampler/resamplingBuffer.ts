export class ResamplingCaptureEngine {
  private sampleRate: number;
  private maxSeconds: number = 30;
  private channels: number = 2;
  private capacitySamples: number;
  private bufferLeft: Float32Array;
  private bufferRight: Float32Array;
  private writeHead: number = 0;
  private isRecording: boolean = false;
  private recordingStartSample: number = 0;

  constructor(sampleRate: number = 44100) {
    this.sampleRate = sampleRate;
    this.capacitySamples = this.sampleRate * this.maxSeconds;
    this.bufferLeft = new Float32Array(this.capacitySamples);
    this.bufferRight = new Float32Array(this.capacitySamples);
  }

  public startCapture() {
    this.writeHead = 0;
    this.isRecording = true;
    this.recordingStartSample = 0;
  }

  // Push raw PCM frames from audio thread tap
  public pushFrame(left: number, right: number) {
    if (!this.isRecording) return;
    this.bufferLeft[this.writeHead] = left;
    this.bufferRight[this.writeHead] = right;
    this.writeHead = (this.writeHead + 1) % this.capacitySamples;
  }

  public stopAndExtractBounce(
    audioCtx: BaseAudioContext,
    bpm: number,
    bars: 1 | 2 | 4 | 8
  ): AudioBuffer {
    this.isRecording = false;

    // Calculate exact sample length for N bars (4/4 time signature)
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * 4;
    const targetSamples = Math.min(
      Math.round(secondsPerBar * bars * this.sampleRate),
      this.capacitySamples
    );

    const extracted = audioCtx.createBuffer(this.channels, targetSamples, this.sampleRate);
    const destLeft = extracted.getChannelData(0);
    const destRight = extracted.getChannelData(1);

    // Read backward from writeHead by targetSamples
    let readIndex = (this.writeHead - targetSamples + this.capacitySamples) % this.capacitySamples;

    for (let i = 0; i < targetSamples; i++) {
      destLeft[i] = this.bufferLeft[readIndex];
      destRight[i] = this.bufferRight[readIndex];
      readIndex = (readIndex + 1) % this.capacitySamples;
    }

    return extracted;
  }

  public release() {
    // Explicit resource release for WebKit memory hygiene
    this.bufferLeft = new Float32Array(0);
    this.bufferRight = new Float32Array(0);
    this.isRecording = false;
  }
}