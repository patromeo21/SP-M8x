class ResamplingProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { startFrame, frameCount } = options.processorOptions;
    this.startFrame = startFrame;
    this.frameCount = frameCount;
    this.capacity = sampleRate * 30;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.writeHead = 0;
    this.captured = 0;
    this.finished = false;
    this.started = false;
    this.port.onmessage = (event) => {
      if (event.data.type === 'cancel') {
        this.finished = true;
        this.left = null;
        this.right = null;
      }
    };
  }

  process(inputs, outputs) {
    if (this.finished) return false;
    if (!this.started) {
      this.started = true;
      if (currentFrame > this.startFrame) {
        this.finished = true;
        this.port.postMessage({ error: 'Bounce missed the bar boundary. Try again.' });
        return false;
      }
    }
    const input = inputs[0];
    const left = input[0];
    const right = input[1] || left;
    const frames = outputs[0][0].length;
    for (let i = 0; i < frames; i++) {
      const frame = currentFrame + i;
      if (frame < this.startFrame) continue;
      if (this.captured >= this.frameCount) break;
      this.left[this.writeHead] = left ? left[i] : 0;
      this.right[this.writeHead] = right ? right[i] : 0;
      this.writeHead = (this.writeHead + 1) % this.capacity;
      this.captured++;
    }
    if (this.captured === this.frameCount) {
      this.finished = true;
      this.port.postMessage({ left: this.left, right: this.right, length: this.captured }, [this.left.buffer, this.right.buffer]);
      return false;
    }
    return true;
  }
}

registerProcessor('sp-m8x-resampling', ResamplingProcessor);
