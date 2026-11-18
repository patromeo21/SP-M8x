export interface SampleRange {
  start: number;
  end: number;
}

export function rangeFromPercent(startPct: number, endPct: number, length: number): SampleRange {
  const end = Math.max(1, Math.min(length, Math.round(endPct * length / 100)));
  const start = Math.max(0, Math.min(end - 1, Math.round(startPct * length / 100)));
  return { start, end };
}

export function percentFromFrame(frame: number, length: number): number {
  return frame * 100 / length;
}

export function findZeroCrossing(
  buffer: AudioBuffer,
  targetSample: number,
  searchWindow: number = 256,
  channel: number = 0
): number {
  const data = buffer.getChannelData(channel);
  const len = data.length;
  const start = Math.max(0, Math.min(len - 1, Math.round(targetSample)));
  const maxDist = Math.min(searchWindow, len - start - 1);

  // Scan forward for rising edge zero-crossing (- to +)
  for (let i = 0; i <= maxDist; i++) {
    const idx = start + i;
    if (idx < len - 1) {
      if (data[idx] <= 0 && data[idx + 1] >= 0) {
        return idx;
      }
    }
  }
  // Fallback to exact target if no zero-crossing found within window
  return start;
}

const reversedBufferCache = new WeakMap<AudioBuffer, AudioBuffer>();

export function getCachedReversedBuffer(
  audioCtx: BaseAudioContext,
  sourceBuffer: AudioBuffer
): AudioBuffer {
  let cached = reversedBufferCache.get(sourceBuffer);
  if (cached) return cached;

  const numChannels = sourceBuffer.numberOfChannels;
  const length = sourceBuffer.length;
  const sampleRate = sourceBuffer.sampleRate;
  cached = audioCtx.createBuffer(numChannels, length, sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const src = sourceBuffer.getChannelData(c);
    const dst = cached.getChannelData(c);
    for (let i = 0; i < length; i++) {
      dst[i] = src[length - 1 - i];
    }
  }

  reversedBufferCache.set(sourceBuffer, cached);
  return cached;
}
