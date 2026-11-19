export interface WaveformMipmapLevels {
  [resolution: number]: {
    min: Float32Array;
    max: Float32Array;
  };
}

export type Waveform2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface WaveformCanvasLayer {
  render(draw: (context: Waveform2DContext) => void): void;
  release(): void;
}

export const WAVEFORM_MIPMAP_RESOLUTIONS = [64, 512, 4096] as const;

function isOffscreenUnavailable(error: unknown): boolean {
  return error instanceof TypeError ||
    (error instanceof Error && ['NotSupportedError', 'InvalidStateError', 'SecurityError'].includes(error.name));
}

export function createWaveformCanvasLayer(canvas: HTMLCanvasElement, alpha: boolean): WaveformCanvasLayer | null {
  const visibleContext = canvas.getContext('2d', { alpha });
  if (!visibleContext) return null;

  let offscreen: OffscreenCanvas | null = null;
  let context: Waveform2DContext = visibleContext;
  if (typeof OffscreenCanvas !== 'undefined') {
    let candidate: OffscreenCanvas | null = null;
    try {
      candidate = new OffscreenCanvas(canvas.width, canvas.height);
      const candidateContext = candidate.getContext('2d', { alpha });
      if (candidateContext) {
        offscreen = candidate;
        context = candidateContext;
      } else {
        candidate.width = 0;
        candidate.height = 0;
      }
    } catch (error) {
      if (candidate) {
        candidate.width = 0;
        candidate.height = 0;
      }
      if (!isOffscreenUnavailable(error)) throw error;
    }
  }

  return {
    render(draw) {
      if (!offscreen) {
        draw(visibleContext);
        return;
      }

      if (offscreen.width !== canvas.width) offscreen.width = canvas.width;
      if (offscreen.height !== canvas.height) offscreen.height = canvas.height;
      draw(context);
      try {
        visibleContext.clearRect(0, 0, canvas.width, canvas.height);
        visibleContext.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
      } catch (error) {
        if (!isOffscreenUnavailable(error)) throw error;
        offscreen.width = 0;
        offscreen.height = 0;
        offscreen = null;
        context = visibleContext;
        visibleContext.clearRect(0, 0, canvas.width, canvas.height);
        draw(visibleContext);
      }
    },
    release() {
      if (offscreen) {
        offscreen.width = 0;
        offscreen.height = 0;
        offscreen = null;
        context = visibleContext;
      }
    },
  };
}

export function releaseWaveformResources(
  canvases: readonly (HTMLCanvasElement | null)[],
  layers: readonly (WaveformCanvasLayer | null)[],
  worker?: Pick<Worker, 'terminate'> | null,
): void {
  worker?.terminate();
  for (const layer of layers) layer?.release();
  for (const canvas of canvases) {
    if (!canvas) continue;
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function startDemandGatedRender(draw: () => void, isPlaying: boolean): () => void {
  if (!isPlaying) {
    draw();
    return () => {};
  }

  let active = true;
  let frame: number | null = null;
  const render = () => {
    if (!active) return;
    draw();
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);

  return () => {
    active = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
}

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
  ctx: Waveform2DContext,
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
  ctx: Waveform2DContext,
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
