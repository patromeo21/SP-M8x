import { percentFromFrame, rangeFromPercent } from './sampleRange';

export function gridSliceMarkers(startPct: number, endPct: number, length: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 2 || count > 32) throw new Error('Choose 2 to 32 slices.');
  const { start, end } = rangeFromPercent(startPct, endPct, length);
  if (end - start < count) throw new Error('Selected region has fewer frames than slices.');
  return Array.from({ length: count + 1 }, (_, index) => start + Math.floor(index * (end - start) / count));
}

export function sliceRange(markers: readonly number[], sliceIndex: number, length: number): { start: number; end: number; index: number } | null {
  if (!Number.isInteger(sliceIndex) || sliceIndex < 1 || markers.length < 2) return null;
  const index = Math.min(sliceIndex, markers.length - 1);
  const start = markers[index - 1];
  const end = markers[index];
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > length || start >= end) return null;
  return { start, end, index };
}

export function gridSliceRanges(startPct: number, endPct: number, length: number, count: number) {
  const markers = gridSliceMarkers(startPct, endPct, length, count);
  return Array.from({ length: count }, (_, index) => ({
    startPct: percentFromFrame(markers[index], length),
    endPct: percentFromFrame(markers[index + 1], length),
  }));
}
