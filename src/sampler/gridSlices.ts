import { percentFromFrame, rangeFromPercent } from './sampleRange';

export function gridSliceRanges(startPct: number, endPct: number, length: number, count: number) {
  if (!Number.isInteger(count) || count < 2 || count > 32) throw new Error('Choose 2 to 32 slices.');
  const { start, end } = rangeFromPercent(startPct, endPct, length);
  if (end - start < count) throw new Error('Selected region has fewer frames than slices.');
  return Array.from({ length: count }, (_, index) => ({
    startPct: percentFromFrame(start + Math.floor(index * (end - start) / count), length),
    endPct: percentFromFrame(start + Math.floor((index + 1) * (end - start) / count), length),
  }));
}
