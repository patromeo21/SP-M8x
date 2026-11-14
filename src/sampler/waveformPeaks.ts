export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
}

/** Builds signed, channel-combined extrema in bounded batches. */
export function createWaveformPeakBuilder(buffer: AudioBuffer, columns: number) {
  const width = Math.max(1, Math.min(buffer.length, Math.floor(columns)));
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  min.fill(Infinity);
  max.fill(-Infinity);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  let column = 0;
  let frame = 0;
  return {
    peaks: { min, max },
    process(maxSamples: number): boolean {
      let remaining = maxSamples;
      while (column < width && remaining > 0) {
        const end = Math.floor((column + 1) * buffer.length / width);
        const stop = Math.min(end, frame + Math.max(1, Math.floor(remaining / channels.length)));
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
        if (frame === end) column++;
      }
      return column === width;
    },
  };
}
