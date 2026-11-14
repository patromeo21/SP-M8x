export interface SampleRange {
  start: number;
  end: number;
}

export function rangeFromPercent(startPct: number, endPct: number, length: number): SampleRange {
  const end = Math.max(1, Math.min(length, Math.round(endPct * length / 100)));
  const start = Math.max(0, Math.min(end - 1, Math.round(startPct * length / 100)));
  return { start, end };
}

export function percentFromFrame(frame: number, length: number): number {
  return frame * 100 / length;
}
