/**
 * SP-M8x Project Selectors
 * Provides safe state queries conforming to the 32-step / 8-track / dual-FX contract.
 */

import { ProjectData, TrackData, PhraseData } from './projectTypes';

export function selectProjectBpm(state: ProjectData): number {
  return state?.bpm || state?.settings?.bpm || 94;
}

export function selectProjectSwing(state: ProjectData): number {
  return state?.swing || state?.settings?.swing || 50;
}

export function selectTracks(state: ProjectData): TrackData[] {
  return state?.tracks || state?.song?.tracks || [];
}

export function selectPhrases(state: ProjectData): Record<string, PhraseData> {
  return state?.phrases || state?.tracker?.patterns || {};
}

export function selectPhraseById(state: ProjectData, phraseId: string): PhraseData | undefined {
  const phrases = selectPhrases(state);
  return phrases[phraseId];
}