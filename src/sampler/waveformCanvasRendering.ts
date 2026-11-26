export type Waveform2DContext = CanvasRenderingContext2D;

export interface WaveformMipmapLevel {
  binsPerSample: number;
  mins: Float32Array;
  maxs: Float32Array;
}

export interface WaveformCanvasLayout {
  width: number;
  height: number;
  dpr?: number;
  viewStartNorm?: number;
  viewEndNorm?: number;
}

export interface DrawWaveformOverlayOptions {
  isPlaying?: boolean;
  playheadNorm?: number;
  slicePoints?: { startNorm: number; endNorm: number };
  sliceMarkers?: number[];
  viewStartNorm?: number;
  viewEndNorm?: number;
  accentColor?: string;
}

export interface DrawWaveformCanvasOptions extends DrawWaveformOverlayOptions {
  canvas?: HTMLCanvasElement;
  ctx?: CanvasRenderingContext2D | null;
  audioBuffer?: AudioBuffer | null;
  peaksCache?: Map<AudioBuffer, WaveformMipmapLevel[]>;
  height?: number;
  backgroundColor?: string;
  waveformColor?: string;
}

const MIPMAP_STRIDES = [16, 64, 512, 4096] as const;

export function buildBufferMipmaps(audioBuffer: AudioBuffer): WaveformMipmapLevel[] {
  const length = audioBuffer.length;
  if (length <= 0) return [];
  const channelCount = Math.max(1, audioBuffer.numberOfChannels);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  return MIPMAP_STRIDES.map((stride) => {
    const binCount = Math.max(1, Math.ceil(length / stride));
    const mins = new Float32Array(binCount);
    const maxs = new Float32Array(binCount);

    for (let b = 0; b < binCount; b++) {
      const start = b * stride;
      const end = Math.min(length, start + stride);
      let minVal = 1;
      let maxVal = -1;

      for (let i = start; i < end; i++) {
        let sample = 0;
        for (let ch = 0; ch < channelCount; ch++) {
          const v = channels[ch][i] ?? 0;
          if (Math.abs(v) > Math.abs(sample)) sample = v;
        }
        if (sample < minVal) minVal = sample;
        if (sample > maxVal) maxVal = sample;
      }

      if (end <= start) {
        minVal = 0;
        maxVal = 0;
      }
      mins[b] = minVal;
      maxs[b] = maxVal;
    }

    return {
      binsPerSample: 1 / stride,
      mins,
      maxs,
    };
  });
}

export function createWaveformCanvas(
  width = 300,
  height = 96,
  dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  _extra1?: unknown,
  _extra2?: unknown,
): HTMLCanvasElement {
  const safeDpr = typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(safeW * safeDpr));
  canvas.height = Math.max(1, Math.floor(safeH * safeDpr));
  return canvas;
}

export const createWaveformCanvasElement = createWaveformCanvas;

export function pointerXToNormalized(
  clientX = 0,
  rect: Pick<DOMRect, 'left' | 'width'> = { left: 0, width: 1 },
  viewStartNorm = 0,
  viewEndNorm = 1,
): number {
  const safeWidth = rect && typeof rect.width === 'number' && rect.width > 0 ? rect.width : 1;
  const safeLeft = rect && typeof rect.left === 'number' ? rect.left : 0;
  const localRatio = Math.max(0, Math.min(1, (clientX - safeLeft) / safeWidth));
  const start = Number.isFinite(viewStartNorm) ? viewStartNorm : 0;
  const end = Number.isFinite(viewEndNorm) ? viewEndNorm : 1;
  return start + localRatio * Math.max(0.0001, end - start);
}

export function releaseWaveformResources(
  canvas?: HTMLCanvasElement | null,
  _extra?: unknown,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
  }
  canvas.width = 0;
  canvas.height = 0;
}

export function startDemandGatedRender(
  renderFn?: () => void,
  _arg2?: unknown,
  _arg3?: unknown,
  _arg4?: unknown,
  _arg5?: unknown,
  _arg6?: unknown,
): () => void {
  let rafId: number | null = null;
  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!cancelled && typeof renderFn === 'function') {
          renderFn();
        }
      });
    } else if (typeof renderFn === 'function') {
      renderFn();
    }
  };

  run();

  return () => {
    cancelled = true;
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

function renderHighResSamples(
  ctx: CanvasRenderingContext2D,
  audioBuffer: AudioBuffer,
  width: number,
  height: number,
  viewStartNorm: number,
  viewEndNorm: number,
  waveformColor: string,
): void {
  const totalSamples = audioBuffer.length;
  const startSample = Math.max(0, Math.min(totalSamples - 1, Math.floor(viewStartNorm * totalSamples)));
  const endSample = Math.max(startSample + 1, Math.min(totalSamples, Math.ceil(viewEndNorm * totalSamples)));
  const visibleSamples = Math.max(1, endSample - startSample);
  const channelData = audioBuffer.getChannelData(0);
  const midY = height / 2;

  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = 1.5;

  if (visibleSamples <= width * 2) {
    ctx.beginPath();
    for (let px = 0; px < width; px++) {
      const exactIdx = startSample + (px / Math.max(1, width - 1)) * Math.max(0, visibleSamples - 1);
      const i0 = Math.max(0, Math.min(totalSamples - 1, Math.floor(exactIdx)));
      const i1 = Math.max(0, Math.min(totalSamples - 1, Math.ceil(exactIdx)));
      const frac = exactIdx - i0;
      const sample = (channelData[i0] ?? 0) * (1 - frac) + (channelData[i1] ?? 0) * frac;
      const y = midY - sample * (midY * 0.9);
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();

    ctx.fillStyle = waveformColor;
    const stepStride = Math.max(1, Math.floor(visibleSamples / Math.max(1, width)));
    for (let s = startSample; s < endSample; s += stepStride) {
      const normX = (s - startSample) / visibleSamples;
      const x = normX * width;
      const y = midY - (channelData[s] ?? 0) * (midY * 0.9);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  for (let px = 0; px < width; px++) {
    const s0 = startSample + Math.floor((px / width) * visibleSamples);
    const s1 = Math.max(s0 + 1, startSample + Math.floor(((px + 1) / width) * visibleSamples));
    let minVal = 1;
    let maxVal = -1;
    for (let s = s0; s < s1 && s < totalSamples; s++) {
      const v = channelData[s] ?? 0;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
    const yTop = midY - maxVal * (midY * 0.9);
    const yBot = midY - minVal * (midY * 0.9);
    ctx.beginPath();
    ctx.moveTo(px + 0.5, yTop);
    ctx.lineTo(px + 0.5, Math.max(yTop + 1, yBot));
    ctx.stroke();
  }
}

export function drawWaveformCanvas(
  optionsOrCanvas: DrawWaveformCanvasOptions | HTMLCanvasElement = {},
  maybeCtx?: CanvasRenderingContext2D | null,
  maybeBuffer?: AudioBuffer | null,
  maybeWidth?: number,
  maybeHeight?: number,
  maybeStart?: number,
  maybeEnd?: number,
  maybeWaveformColor?: string,
  maybeAccentColor?: string,
): void {
  const isCanvasCall =
    typeof HTMLCanvasElement !== 'undefined' && optionsOrCanvas instanceof HTMLCanvasElement;

  const opts: DrawWaveformCanvasOptions = isCanvasCall
    ? {
        canvas: optionsOrCanvas,
        ctx: maybeCtx,
        audioBuffer: maybeBuffer ?? null,
        height: maybeHeight ?? 96,
        viewStartNorm: maybeStart ?? 0,
        viewEndNorm: maybeEnd ?? 1,
        waveformColor: maybeWaveformColor ?? '#38bdf8',
        accentColor: maybeAccentColor ?? '#f59e0b',
      }
    : optionsOrCanvas;

  const canvas = opts.canvas;
  const ctx = opts.ctx ?? canvas?.getContext('2d') ?? null;
  if (!canvas || !ctx) return;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const rect = typeof canvas.getBoundingClientRect === 'function'
    ? canvas.getBoundingClientRect()
    : { width: maybeWidth ?? 300, height: opts.height ?? 96 };
  const width = Math.max(1, Math.floor(maybeWidth ?? (rect.width || canvas.clientWidth || 300)));
  const height = Math.max(1, Math.floor(maybeHeight ?? (opts.height || rect.height || canvas.clientHeight || 96)));
  const backgroundColor = opts.backgroundColor ?? '#09090b';
  const waveformColor = opts.waveformColor ?? '#38bdf8';
  const accentColor = opts.accentColor ?? '#f59e0b';
  const viewStartNorm = opts.viewStartNorm ?? 0;
  const viewEndNorm = opts.viewEndNorm ?? 1;

  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const audioBuffer = opts.audioBuffer ?? null;
  if (audioBuffer && audioBuffer.length > 0) {
    const safeStart = Math.max(0, Math.min(1, viewStartNorm));
    const safeEnd = Math.max(safeStart + 0.0001, Math.min(1, viewEndNorm));
    const visibleRatio = safeEnd - safeStart;
    const visibleSamples = audioBuffer.length * visibleRatio;

    if (visibleSamples <= width * 8) {
      renderHighResSamples(ctx, audioBuffer, width, height, safeStart, safeEnd, waveformColor);
    } else {
      const cache = opts.peaksCache;
      let levels = cache?.get(audioBuffer);
      if (!levels) {
        levels = buildBufferMipmaps(audioBuffer);
        if (cache) {
          cache.set(audioBuffer, levels);
        }
      }

      const selectedLevel =
        levels.find((item) => {
          const binCount = item.mins.length;
          if (binCount <= 0) return false;
          const samplesPerBin = audioBuffer.length / binCount;
          return samplesPerBin <= visibleSamples / width;
        }) ?? levels[levels.length - 1];

      if (selectedLevel && selectedLevel.mins.length > 0) {
        const binCount = selectedLevel.mins.length;
        const startBin = Math.max(0, Math.floor(safeStart * binCount));
        const endBin = Math.max(startBin + 1, Math.ceil(safeEnd * binCount));
        const binSpan = endBin - startBin;
        const midY = height / 2;

        ctx.strokeStyle = waveformColor;
        ctx.lineWidth = 1;

        for (let px = 0; px < width; px++) {
          const b0 = startBin + Math.floor((px / width) * binSpan);
          const b1 = Math.max(b0 + 1, startBin + Math.floor(((px + 1) / width) * binSpan));
          let minVal = 1;
          let maxVal = -1;
          for (let b = b0; b < b1 && b < binCount; b++) {
            const binMin = selectedLevel.mins[b] ?? 0;
            const binMax = selectedLevel.maxs[b] ?? 0;
            if (binMin < minVal) minVal = binMin;
            if (binMax > maxVal) maxVal = binMax;
          }
          const yTop = midY - maxVal * (midY * 0.9);
          const yBot = midY - minVal * (midY * 0.9);
          ctx.beginPath();
          ctx.moveTo(px + 0.5, yTop);
          ctx.lineTo(px + 0.5, Math.max(yTop + 1, yBot));
          ctx.stroke();
        }
      } else {
        renderHighResSamples(ctx, audioBuffer, width, height, safeStart, safeEnd, waveformColor);
      }
    }
  }

  drawWaveformOverlay(ctx, width, height, {
    isPlaying: opts.isPlaying,
    playheadNorm: opts.playheadNorm,
    slicePoints: opts.slicePoints,
    sliceMarkers: opts.sliceMarkers,
    viewStartNorm,
    viewEndNorm,
    accentColor,
  });

  ctx.restore();
}

export function drawStaticWaveform(
  canvasOrOpts: HTMLCanvasElement | DrawWaveformCanvasOptions,
  ctx?: CanvasRenderingContext2D | null,
  audioBuffer?: AudioBuffer | null,
  width?: number,
  height?: number,
  viewStartNorm?: number,
  viewEndNorm?: number,
  waveformColor?: string,
  accentColor?: string,
): void {
  drawWaveformCanvas(
    canvasOrOpts as any,
    ctx,
    audioBuffer,
    width,
    height,
    viewStartNorm,
    viewEndNorm,
    waveformColor,
    accentColor,
  );
}

export function drawWaveformOverlay(
  ctx?: CanvasRenderingContext2D | null,
  widthOrOpts: number | DrawWaveformOverlayOptions = 300,
  heightOrSecondArg: number | DrawWaveformOverlayOptions = 96,
  maybeOptions?: DrawWaveformOverlayOptions,
): void {
  if (!ctx) return;

  const opts: DrawWaveformOverlayOptions =
    typeof widthOrOpts === 'object'
      ? widthOrOpts
      : maybeOptions ?? {};
  const width = typeof widthOrOpts === 'number' ? widthOrOpts : 300;
  const height = typeof heightOrSecondArg === 'number' ? heightOrSecondArg : 96;

  const isPlaying = Boolean(opts.isPlaying);
  const playheadNorm = opts.playheadNorm ?? 0;
  const slicePoints = opts.slicePoints;
  const sliceMarkers = opts.sliceMarkers;
  const viewStartNorm = opts.viewStartNorm ?? 0;
  const viewEndNorm = opts.viewEndNorm ?? 1;
  const accentColor = opts.accentColor ?? '#f59e0b';
  const span = Math.max(0.0001, viewEndNorm - viewStartNorm);

  if (slicePoints) {
    const startX = ((slicePoints.startNorm - viewStartNorm) / span) * width;
    const endX = ((slicePoints.endNorm - viewStartNorm) / span) * width;

    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    if (startX >= 0 && startX <= width) {
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.stroke();
    }
    if (endX >= 0 && endX <= width) {
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (sliceMarkers && sliceMarkers.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    for (const markerNorm of sliceMarkers) {
      const x = ((markerNorm - viewStartNorm) / span) * width;
      if (x >= 0 && x <= width) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  if (isPlaying || playheadNorm > 0) {
    const clamped = Math.max(0, Math.min(1, playheadNorm));
    const x = ((clamped - viewStartNorm) / span) * width;
    if (x >= 0 && x <= width) {
      ctx.save();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.restore();
    }
  }
}