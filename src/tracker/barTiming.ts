export function nextBarTime(startTime: number, bpm: number, afterTime: number): number {
  const barDuration = 240 / bpm;
  const index = Math.max(0, Math.ceil((afterTime - startTime) / barDuration));
  return startTime + index * barDuration;
}
