/**
 * SP-M8x Hybrid Music Production Suite
 * phraseRecorder.ts — Live Phrase Recorder & Micro-Timing Quantizer
 * 
 * Translates live SP-404 style pad triggers and punch-in FX into M8-style tracker steps with subTickOffset micro-timing.
 */

import type { ProjectPattern, TrackerStepItem, PadAssignment } from '../project/projectTypes';
import { updatePatternStep } from '../project/trackerHelpers';

export interface RecordedEvent {
  timestampMs: number;
  bank: 'A' | 'B' | 'C' | 'D';
  slot: number;
  velocity: number; // 0.0 to 1.0
  punchInFxCode?: string;
  punchInFxValue?: number;
}

export interface QuantizeOptions {
  bpm: number;
  stepsPerBeat?: number;    // default 4 (16th notes)
  subTicksPerStep?: number; // default 6 (0-5 ticks for subTickOffset groove resolution)
}

export class PhraseRecorder {
  /**
   * Quantizes a collection of raw live performance events into tracker steps with sub-tick micro-timing.
   */
  public static quantizeEventsToPattern(
    events: RecordedEvent[],
    pattern: ProjectPattern,
    assignments: PadAssignment[],
    options: QuantizeOptions,
  ): ProjectPattern {
    const bpm = options.bpm;
    const stepsPerBeat = options.stepsPerBeat ?? 4;
    const subTicksPerStep = options.subTicksPerStep ?? 6;
    
    // Duration calculations based on BPM
    const msPerBeat = 60000 / bpm;
    const msPerStep = msPerBeat / stepsPerBeat;

    let updatedPattern = { ...pattern };

    for (const event of events) {
      // Find matching pad assignment
      const assignment = assignments.find(
        (a) => a.bank === event.bank && a.slot === event.slot
      );
      if (!assignment) continue;

      // Calculate exact step float and sub-tick micro-timing offset
      const exactStepFloat = event.timestampMs / msPerStep;
      const stepIndex = Math.floor(exactStepFloat) % pattern.length;
      
      const stepRemainder = exactStepFloat - Math.floor(exactStepFloat);
      const subTickFloat = stepRemainder * subTicksPerStep;
      const subTickOffset = Math.max(0, Math.min(subTicksPerStep - 1, Math.round(subTickFloat)));

      // Format note name from assignment chromatic root note
      const noteName = this.midiNoteToName(assignment.chromaticRootNote ?? 60);

      const stepChanges: Partial<TrackerStepItem> = {
        subTickOffset,
        note: noteName,
        velocity: Math.max(1, Math.min(127, Math.round(event.velocity * 127))),
        instrumentAssignmentId: assignment.id,
        phraseFx: event.punchInFxCode ?? '--',
        phraseFxValue: event.punchInFxValue ?? 0,
      };

      updatedPattern = updatePatternStep(updatedPattern, stepIndex, stepChanges);
    }

    return updatedPattern;
  }

  private static midiNoteToName(midiNote: number): string {
    const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = notes[midiNote % 12];
    return `${noteName}${octave}`;
  }
}
