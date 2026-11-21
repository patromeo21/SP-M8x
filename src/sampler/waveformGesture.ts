import type { SampleRange } from './sampleRange';

export function markerRangeAtPointer(
  original: SampleRange,
  edge: 'start' | 'end',
  origin: number,
  startX: number,
  clientX: number,
  viewLength: number,
  width: number,
  length: number,
): SampleRange {
  if (clientX === startX || width <= 0 || length <= 0) return original;
  const frame = Math.max(0, Math.min(length, origin + Math.round((clientX - startX) * viewLength / width)));
  return edge === 'start'
    ? { ...original, start: Math.min(frame, original.end - 1) }
    : { ...original, end: Math.max(frame, original.start + 1) };
}

export function intermediateMarkerFrameAtPointer(
  neighbors: SampleRange,
  origin: number,
  startX: number,
  clientX: number,
  viewStart: number,
  viewEnd: number,
  viewLength: number,
  width: number,
  length: number,
): number {
  if (length <= 0) return origin;
  const minFrame = Math.max(0, Math.min(length, neighbors.start + 1));
  const maxFrame = Math.max(minFrame, Math.min(length, neighbors.end - 1));
  if (clientX === startX || width <= 0) {
    return Math.max(minFrame, Math.min(maxFrame, origin));
  }
  const visibleLength = Math.max(0, Math.min(length, viewEnd) - Math.max(0, viewStart));
  const frameScale = Math.min(Math.max(0, viewLength), visibleLength);
  const frame = origin + Math.round((clientX - startX) * frameScale / width);
  return Math.max(minFrame, Math.min(maxFrame, frame));
}
