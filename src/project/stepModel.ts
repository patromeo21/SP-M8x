// src/project/stepModel.ts
export type PlayMode = 'one-shot' | 'gate' | 'loop' | 'reverse';

export interface StepEvent {
  id: string;
  note: string;
  instrumentId: number | null;
  padId: number;
  velocity: number;
  subTickOffset: number; // -4 to +4
  fx?: string;
  fxValue?: number;
  // Snapshot inheritance: pad playback settings stamped at record time
  playMode: PlayMode;
  sliceStartFrame: number;
  sliceEndFrame: number;
  isReversed: boolean;
}

export interface PolyphonicPhraseStep {
  stepIndex: number;
  events: StepEvent[];
}

const PLAY_MODES: readonly PlayMode[] = ['one-shot', 'gate', 'loop', 'reverse'];

export function validateStepEvent(event: StepEvent): void {
  if (!event || typeof event !== 'object') throw new Error('Invalid step event.');
  if (typeof event.id !== 'string' || event.id.length === 0) throw new Error('Invalid step event ID.');
  if (typeof event.note !== 'string' || event.note.length === 0) throw new Error('Invalid step event note.');
  if (event.instrumentId !== null &&
      (!Number.isInteger(event.instrumentId) || event.instrumentId < 0 || event.instrumentId > 63)) {
    throw new Error('Invalid step event instrument ID.');
  }
  if (!Number.isInteger(event.padId) || event.padId < 0 || event.padId > 63) throw new Error('Invalid step event pad ID.');
  if (!Number.isInteger(event.velocity) || event.velocity < 0 || event.velocity > 127) throw new Error('Step event velocity must be 0 to 127.');
  if (!Number.isInteger(event.subTickOffset) || event.subTickOffset < -8 || event.subTickOffset > 8) {
    throw new Error('Step event microtiming must be -8 to 8.');
  }
  if (!PLAY_MODES.includes(event.playMode)) throw new Error(`Invalid play mode: ${event.playMode}`);
  if (!Number.isSafeInteger(event.sliceStartFrame) || event.sliceStartFrame < 0) throw new Error('Invalid slice start frame.');
  if (!Number.isSafeInteger(event.sliceEndFrame) || event.sliceEndFrame <= event.sliceStartFrame) {
    throw new Error('Slice end must be a frame after the slice start.');
  }
  if (typeof event.isReversed !== 'boolean') throw new Error('Invalid reverse flag.');
}

function eventId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Captures the active pad's playback settings into a new polyphonic step event. */
export function createRecordedStepEvent(params: Omit<StepEvent, 'id'>): StepEvent {
  const event: StepEvent = { id: eventId(), ...params };
  validateStepEvent(event);
  return event;
}
