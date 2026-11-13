/**
 * SP-M8x Project Data Types
 * Updated to support 32-step phrases, dual FX slots, SUB micro-timing, and Table FX latches.
 */

export type StepNote = string | null; // e.g., "C-4", "OFF", null
export type InstrumentId = string | null; // e.g., "A01"
export type VolumeValue = number | null; // 0x00 to 0x7F

export interface StepFxCommand {
  opcode: string; // e.g., "STA", "PIT", "PAN", "VOL", "REP", "HOP", "CHA", "---"
  value: number;  // 0x00 to 0xFF
}

export interface StepData {
  stepIndex: number; // 0 to 31 (2 bars / 32 steps)
  note: StepNote;
  instrument: InstrumentId;
  volume: VolumeValue;
  fx1: StepFxCommand;
  fx2: StepFxCommand;
  sub: number; // 0 to 7 micro-timing / delay offset
}

export interface TableFxLatch {
  id: string;
  fxType: 'KILL' | 'RET' | 'CUT' | 'DEG' | 'SDL';
  targetTrack: number; // 0 to 7 (or -1 for Master Bus)
  engageStep: number;  // 0 to 31
  engageSub: number;   // 0 to 7
  releaseStep: number; // 0 to 31
  releaseSub: number;  // 0 to 7
  parameterValues?: number[]; // Captured control knob values during hold
}

export interface TableRow {
  rowIndex: number; // 0 to 15
  command: string;  // e.g., "STA", "PIT", "VOL", "---"
  value: number;
}

export interface PhraseData {
  id: string;
  name: string;
  steps: StepData[]; // Exactly 32 steps per phrase
  tableLatches: TableFxLatch[];
  tableRows: TableRow[];
}

export interface TrackData {
  trackIndex: number; // 0 to 7
  name: string;
  volume: number; // 0.0 to 1.0
  pan: number;    // -1.0 to 1.0
  muted: boolean;
  soloed: boolean;
  activePhraseId: string;
}

export interface ProjectData {
  version: string;
  bpm: number;
  swing: number;
  tracks: TrackData[]; // Exactly 8 tracks
  phrases: Record<string, PhraseData>;
  instruments: Record<string, any>;
}