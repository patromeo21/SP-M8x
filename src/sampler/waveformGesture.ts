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
