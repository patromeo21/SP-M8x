export interface StepPLocks {
  /** Semitones (-24 to +24) */
  pitchOffset?: number;
  /** Hz (20 to 20000) */
  filterCutoff?: number;
  /** Q factor */
  resonance?: number;
  /** Milliseconds */
  decayMs?: number;
  /** Stereo pan (-1.0 to +1.0) */
  pan?: number;
  /** Aux send level (0.0 to 1.0) */
  fxSend?: number;
}

export interface ConditionalTrig {
  /** 0 to 100 percentage chance */
  probability?: number;
  /** e.g., "1:2", "2:4", "3:4" */
  cycleCondition?: string;
  /** Only triggers when live FILL button is held */
  fillOnly?: boolean;
}

export interface EnhancedTrackerStep extends StepPLocks, ConditionalTrig {
  step: number;
  note: string | null;
  padId?: string | null; // Step sample-slot override (defaults to track/instrument)
  inst: string | null;
  vol: string | null;
  fx: string | null;
  tbl: string | null;
}