export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
}

/** Builds signed, channel-combined extrema in bounded batches. */
export function createWaveformPeakBuilder(buffer: AudioBuffer, columns: number, start = 0, end = buffer.length) {
  const length = end - start;
  const width = Math.max(1, Math.min(length, Math.floor(columns)));
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  min.fill(Infinity);
  max.fill(-Infinity);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  let column = 0;
  let frame = start;
  return {
    peaks: { min, max },
    process(maxSamples: number): boolean {
      let remaining = maxSamples;
      while (column < width && remaining > 0) {
        const columnEnd = start + Math.floor((column + 1) * length / width);
        const stop = Math.min(columnEnd, frame + Math.max(1, Math.floor(remaining / channels.length)));
        for (let channel = 0; channel < channels.length; channel++) {
          const data = channels[channel];
          let low = min[column];
          let high = max[column];
          for (let i = frame; i < stop; i++) {
            const value = data[i];
            if (value < low) low = value;
            if (value > high) high = value;
          }
          min[column] = low;
          max[column] = high;
        }
        remaining -= (stop - frame) * channels.length;
        frame = stop;
        if (frame === columnEnd) column++;
      }
      return column === width;
    },
  };
}
