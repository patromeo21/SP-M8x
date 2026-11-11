/**
 * SP-M8x Hybrid Music Production Suite
 * audioEngine.ts — Web Audio API Core Engine & Buffer Cache Integration
 */

import { projectController } from '../project/projectController';
import { audioCache } from './audioCache';
import type { BankId, PadAssignment } from '../project/projectTypes';

class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;

  public getContext(): AudioContext {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      
      this.masterGainNode = this.audioContext.createGain();
      const state = projectController.getState();
      this.masterGainNode.gain.setValueAtTime(state.settings.masterVolume, this.audioContext.currentTime);
      this.masterGainNode.connect(this.audioContext.destination);
    }
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    return this.audioContext;
  }

  public updateMasterVolume(volume: number): void {
    if (!this.masterGainNode || !this.audioContext) return;
    this.masterGainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.audioContext.currentTime);
  }

  /**
   * Trigger a pad using stable sample asset identifiers and runtime audio cache.
   */
  public triggerPad(bank: BankId, slot: number): void {
    const ctx = this.getContext();
    const state = projectController.getState();

    const pad = state.sampler.assignments.find((p: PadAssignment) => p.bank === bank && p.slot === slot);
    if (!pad || !pad.sampleAssetId) {
      console.warn(`[AudioEngine] No sample assigned to Pad ${bank}-${slot + 1}`);
      return;
    }

    const buffer = audioCache.get(pad.sampleAssetId);
    if (!buffer) {
      console.warn(`[AudioEngine] AudioBuffer not found in cache for asset ID: ${pad.sampleAssetId}`);
      return;
    }

    try {
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = buffer;

      const gainNode = ctx.createGain();
      const targetVolume = Math.max(0, Math.min(1, pad.volume));
      gainNode.gain.setValueAtTime(targetVolume, ctx.currentTime);

      sourceNode.connect(gainNode);
      if (this.masterGainNode) {
        gainNode.connect(this.masterGainNode);
      } else {
        gainNode.connect(ctx.destination);
      }

      const startSec = Math.max(0, pad.sliceStartSeconds);
      const duration = pad.sliceEndSeconds !== null && pad.sliceEndSeconds > startSec 
        ? pad.sliceEndSeconds - startSec 
        : buffer.duration - startSec;

      sourceNode.start(ctx.currentTime, startSec, duration > 0 ? duration : undefined);
    } catch (err) {
      console.error('[AudioEngine] Error triggering pad audio:', err);
    }
  }
}

export const audioEngine = new AudioEngine();