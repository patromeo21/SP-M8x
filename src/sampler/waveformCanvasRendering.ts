export interface WaveformMipmapLevels {
  [resolution: number]: {
    min: Float32Array;
    max: Float32Array;
  };
}

export const WAVEFORM_MIPMAP_RESOLUTIONS = [64, 512, 4096] as const;

export function selectWaveformResolution(width: number, viewStart: number, viewEnd: number): number {
  const visibleRange = Math.max(0, viewEnd - viewStart);
  const minimumVisibleBins = width / 2;
  return WAVEFORM_MIPMAP_RESOLUTIONS.find((resolution) => resolution * visibleRange >= minimumVisibleBins) ?? 4096;
}

export function normalizedToCanvasX(value: number, viewStart: number, viewEnd: number, width: number): number {
  return (value - viewStart) / Math.max(1e-6, viewEnd - viewStart) * width;
}

export function pointerXToNormalized(
  clientX: number,
  left: number,
  width: number,
  viewStart: number,
  viewEnd: number,
): number {
  if (width <= 0) return viewStart;
  const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
  return viewStart + ratio * (viewEnd - viewStart);
}

export function drawStaticWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mipmaps: WaveformMipmapLevels | null,
  viewStart: number,
  viewEnd: number,
): void {
  ctx.fillStyle = '#13171d';
  ctx.fillRect(0, 0, width, height);
  if (!mipmaps) return;

  const peakData = mipmaps[selectWaveformResolution(width, viewStart, viewEnd)] ?? mipmaps[512];
  if (!peakData) return;

  const count = Math.min(peakData.min.length, peakData.max.length);
  const firstBin = Math.max(0, Math.floor(viewStart * count));
  const lastBin = Math.min(count, Math.ceil(viewEnd * count));
  const mid = height / 2;

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = firstBin; i < lastBin; i++) {
    const x = normalizedToCanvasX((i + 0.5) / count, viewStart, viewEnd, width);
    if (x < 0 || x > width) continue;

    ctx.moveTo(x, mid + peakData.min[i] * mid * 0.85);
    ctx.lineTo(x, mid + peakData.max[i] * mid * 0.85);
  }
  ctx.stroke();
}

export function drawWaveformOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewStart: number,
  viewEnd: number,
  sliceStart: number | undefined,
  sliceEnd: number | undefined,
  sliceMarkers: readonly number[] | undefined,
  playheadNorm: number | null,
): void {
  ctx.clearRect(0, 0, width, height);

  if (sliceStart !== undefined && sliceEnd !== undefined) {
    const visibleStart = Math.max(viewStart, sliceStart);
    const visibleEnd = Math.min(viewEnd, sliceEnd);
    const startX = normalizedToCanvasX(visibleStart, viewStart, viewEnd, width);
    const endX = normalizedToCanvasX(visibleEnd, viewStart, viewEnd, width);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    if (endX > startX) ctx.fillRect(startX, 0, endX - startX, height);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (sliceStart >= viewStart && sliceStart <= viewEnd) {
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
    }
    if (sliceEnd >= viewStart && sliceEnd <= viewEnd) {
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
    }
    ctx.stroke();
  }

  if (sliceMarkers?.length) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const marker of sliceMarkers) {
      if (marker < viewStart || marker > viewEnd) continue;
      const x = normalizedToCanvasX(marker, viewStart, viewEnd, width);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
  }

  if (playheadNorm !== null) {
    const x = normalizedToCanvasX(playheadNorm, viewStart, viewEnd, width);
    ctx.strokeStyle = '#38e58c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}
