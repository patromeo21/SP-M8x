class ResamplingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.startFrame = 0;
    this.frameCount = 0;
    this.capacity = 0;
    this.left = null;
    this.right = null;
    this.result = null;
    this.missed = null;
    this.pending = null;
    this.transfers = null;
    this.writeHead = 0;
    this.captured = 0;
    this.finished = false;
    this.started = false;
    this.prepared = false;
    this.complete = false;
    this.missedStart = false;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'capture' && !this.finished) {
        this.startFrame = data.startFrame;
        this.frameCount = data.length;
        this.left = data.left;
        this.right = data.right;
        this.capacity = data.left.length;
        this.result = data.result;
        this.missed = data.missed;
        this.pending = data.pending;
        this.transfers = data.transfers;
        this.prepared = true;
      } else if (data.type === 'poll' && this.prepared && !this.finished) {
        if (this.missedStart) {
          this.finished = true;
          this.port.postMessage(this.missed);
        } else if (this.complete) {
          this.finished = true;
          this.port.postMessage(this.result, this.transfers);
        } else {
          this.port.postMessage(this.pending);
        }
      } else if (data.type === 'cancel') {
        this.finished = true;
        this.left = null;
        this.right = null;
        this.result = null;
        this.missed = null;
        this.pending = null;
        this.transfers = null;
      }
    };
  }

  process(inputs, outputs) {
    if (this.finished) return false;
    if (!this.prepared) return true;
    if (this.complete || this.missedStart) return true;
    if (!this.started) {
      this.started = true;
      if (currentFrame > this.startFrame) {
        this.missedStart = true;
        return true;
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
      this.complete = true;
    }
    return true;
  }
}

registerProcessor('sp-m8x-resampling', ResamplingProcessor);
