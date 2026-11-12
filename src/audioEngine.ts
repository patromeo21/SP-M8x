/**
 * Legacy import compatibility facade.
 * All operations delegate to the canonical engine in src/audio/audioEngine.ts;
 * this module intentionally owns no AudioContext, buffers, or voices.
 */

import { audioEngine as canonicalAudioEngine } from './audio/audioEngine';

export interface ActiveVoice {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  padId: number;
  startTime: number;
}

class LegacyAudioEngineFacade {
  public async init(): Promise<AudioContext> {
    return canonicalAudioEngine.initialize();
  }

  public initialize(context?: AudioContext): AudioContext {
    return canonicalAudioEngine.initialize(context);
  }

  public getContext(): AudioContext | null {
    return canonicalAudioEngine.getContext();
  }

  public decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return canonicalAudioEngine.decodeAudioData(arrayBuffer);
  }

  public setPadBuffer(padId: number, buffer: AudioBuffer): void {
    canonicalAudioEngine.setPadBuffer(padId, buffer);
  }

  public getPadBuffer(padId: number): AudioBuffer | undefined {
    return canonicalAudioEngine.getPadBuffer(padId);
  }

  public triggerPad(
    padId: number,
    options: {
      sliceStart?: number;
      sliceEnd?: number;
      volume?: number;
      semitoneOffset?: number;
      loop?: boolean;
    } = {},
  ): string | null {
    return canonicalAudioEngine.triggerPad(padId, options);
  }

  public triggerVoice(padId: string | number, buffer?: AudioBuffer, pan = 0): void {
    canonicalAudioEngine.triggerVoice(padId, buffer, pan);
  }

  public stopVoice(voiceId: string | number): void {
    canonicalAudioEngine.stopVoice(voiceId);
  }

  public stopAllVoices(): void {
    canonicalAudioEngine.stopAllVoices();
  }

  public setMasterVolume(volume: number): void {
    canonicalAudioEngine.setMasterVolume(volume);
  }
}

export const audioEngine = new LegacyAudioEngineFacade();
export default audioEngine;
