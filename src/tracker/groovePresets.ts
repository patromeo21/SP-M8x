export const GROOVE_PRESETS = ['8-8', '9-7', '10-6', '11-5', '12-4', '9-9-7-7'] as const;
export type GroovePreset = (typeof GROOVE_PRESETS)[number];

const BAR_STEPS = 16;

export interface GrooveMetronomePulse {
  step: number;
  downbeat: boolean;
  subAccent?: boolean;
}

export function isGroovePreset(value: string): value is GroovePreset {
  return (GROOVE_PRESETS as readonly string[]).includes(value);
}

export function writeGrooveSlots(preset: GroovePreset, target: Uint8Array, barSteps = BAR_STEPS): void {
  const count = Math.min(target.length, barSteps);
  if (preset === '8-8') {
    for (let step = 0; step < count; step++) {
      target[step] = 8;
    }
    return;
  }
  if (preset === '9-9-7-7') {
    for (let step = 0; step < count; step++) {
      target[step] = step % 4 < 2 ? 9 : 7;
    }
    return;
  }
  const separator = preset.indexOf('-');
  let longValue = 0;
  for (let index = 0; index < separator; index++) {
    longValue = longValue * 10 + (preset.charCodeAt(index) - 48);
  }
  const shortValue = 16 - longValue;
  for (let step = 0; step < count; step++) {
    target[step] = step % 4 % 2 === 0 ? longValue : shortValue;
  }
}

export function getGrooveSlots(preset: GroovePreset, barSteps = BAR_STEPS): Uint8Array {
  const slots = new Uint8Array(barSteps);
  writeGrooveSlots(preset, slots, barSteps);
  return slots;
}

export function getGrooveDelayedSteps(preset: GroovePreset): boolean[] {
  const slots = getGrooveSlots(preset);
  let offset = 0;
  return Array.from(slots, (slot) => {
    const delayed = offset > 0;
    offset += slot - 8;
    return delayed;
  });
}

export function getGrooveSwungSteps(preset: GroovePreset, barSteps = BAR_STEPS): boolean[] {
  if (preset === '8-8') {
    return Array.from({ length: barSteps }, () => false);
  }
  const delayed = getGrooveDelayedSteps(preset);
  return Array.from({ length: barSteps }, (_, step) => Boolean(delayed[step % BAR_STEPS]));
}

export function getGrooveMetronomePulses(preset: GroovePreset, barSteps = BAR_STEPS): GrooveMetronomePulse[] {
  if (barSteps <= 0) return [];
  const slots = getGrooveSlots(preset, barSteps);
  const swungSteps = getGrooveSwungSteps(preset, barSteps);
  const pulses: GrooveMetronomePulse[] = [];
  let elapsed = 0;
  for (let step = 0; step < barSteps; step++) {
    const isBeatPulse = elapsed % 32 === 0;
    const isSwungSubPulse = preset !== '8-8' && swungSteps[step];
    if (isBeatPulse || isSwungSubPulse) {
      pulses.push({
        step,
        downbeat: elapsed % 128 === 0,
        subAccent: !isBeatPulse && isSwungSubPulse,
      });
    }
    elapsed += slots[step];
  }
  return pulses;
}