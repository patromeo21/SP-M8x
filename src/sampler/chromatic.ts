export type PadPlayMode = 'BANK_64' | 'CHROMATIC_16';

const NOTES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

export function chromaticOffset(padIndex: number, rootOffset: number): number {
  return padIndex - 7 + rootOffset;
}

export function chromaticNote(offset: number): string {
  const midi = 60 + offset;
  return `${NOTES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
