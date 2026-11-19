export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
}

export interface WebKitCanvasSurface {
  width: number;
  height: number;
  getContext?: (
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings
  ) => {
    clearRect?: (x: number, y: number, width: number, height: number) => void;
  } | null;
}

/**
 * Releases WebKit / iPad Safari GPU backing-store memory for a canvas or
 * OffscreenCanvas on unmount. Safe in Node and non-DOM test environments.
 */
export function releaseWebKitCanvasSurface(
  surface: WebKitCanvasSurface | null | undefined
): void {
  if (!surface) {
    return;
  }

  try {
    const width = typeof surface.width === 'number' ? surface.width : 0;
    const height = typeof surface.height === 'number' ? surface.height : 0;
    if (width > 0 && height > 0 && typeof surface.getContext === 'function') {
      const ctx = surface.getContext('2d');
      if (ctx && typeof ctx.clearRect === 'function') {
        ctx.clearRect(0, 0, width, height);
      }
    }
  } catch {
    // Ignore context teardown errors during unmount
  }

  surface.width = 0;
  surface.height = 0;
}

/**
 * Releases a batch of canvas or OffscreenCanvas surfaces in order.
 */
export function releaseWebKitCanvasSurfaces(
  surfaces: ReadonlyArray<WebKitCanvasSurface | null | undefined>
): void {
  for (let i = 0; i < surfaces.length; i += 1) {
    releaseWebKitCanvasSurface(surfaces[i]);
  }
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