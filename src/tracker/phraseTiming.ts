import type { TrackerStepItem } from '../project/projectController';

export function phraseTimingMarkers(steps: TrackerStepItem[], page: number): { index: number; tick: number }[] {
  const lengthInTicks = steps.length * 8;
  if (!lengthInTicks || (page !== 0 && page !== 1)) return [];
  return steps.flatMap((step, index) => {
    if (!step.sampleId || step.sampleId === '--') return [];
    const raw = step.subTickOffset;
    const offset = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(-4, Math.min(4, raw)) : 0;
    const tick = ((index * 8 + offset) % lengthInTicks + lengthInTicks) % lengthInTicks;
    return tick >= page * 128 && tick < (page + 1) * 128 ? [{ index, tick: tick - page * 128 }] : [];
  });
}
