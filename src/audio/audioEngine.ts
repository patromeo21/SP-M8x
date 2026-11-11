/**
 * SP-M8x Hybrid Music Production Suite
 * audioEngine.ts — Web Audio DSP Engine with FX Macro Bus & Voice Stealing
 */

import { FXEngine, FXType } from '../fx/fxEngine';

export interface ActiveVoice {
  id: string;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  startTime: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private fxEngine: FXEngine | null = null;
  
  private activeVoices: Map<string, ActiveVoice[]> = new Map();
  private maxVoicesPerPad: number = 4;
  private isInitialized: boolean = false;

  constructor() {}

  public async initialize(): Promise<AnalyserNode | null> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return this.analyser;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Master Gain Staging Protection (-6dB headroom)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);

    // Dynamics Compressor / Limiter
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(6, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

    // Analyser Node for 120fps visualizer
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // Connect Output Chain: MasterGain -> Compressor -> Analyser -> Destination
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Initialize FX Engine inserting into MasterGain
    this.fxEngine = new FXEngine(this.ctx, this.masterGain);

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isInitialized = true;
    console.log('[SP-M8x AudioEngine] Initialized with FX Macro Bus and Master Limiters.');
    return this.analyser;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public setPunchInFX(fx: FXType, intensity: number = 0.5): void {
    if (this.fxEngine) {
      this.fxEngine.setEffect(fx, intensity);
    }
  }

  /**
   * Trigger audio voice routing through FX Engine input
   */
  public triggerVoice(padId: string, buffer: AudioBuffer, playbackRate: number = 1.0): void {
    if (!this.ctx || !this.fxEngine || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, now);

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(1.0, now);

    // Connect voice: Source -> VoiceGain -> FXEngine Input
    source.connect(voiceGain);
    voiceGain.connect(this.fxEngine.getInputNode());

    if (!this.activeVoices.has(padId)) {
      this.activeVoices.set(padId, []);
    }
    const voices = this.activeVoices.get(padId)!;

    if (voices.length >= this.maxVoicesPerPad) {
      const oldestVoice = voices.shift();
      if (oldestVoice) {
        try {
          oldestVoice.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.01);
          oldestVoice.source.stop(now + 0.01);
          oldestVoice.source.disconnect();
          oldestVoice.gainNode.disconnect();
        } catch {
          // Ignore stopped node errors
        }
      }
    }

    const newVoice: ActiveVoice = {
      id: `${padId}-${now}-${Math.random()}`,
      source,
      gainNode: voiceGain,
      startTime: now,
    };

    voices.push(newVoice);

    source.onended = () => {
      source.disconnect();
      voiceGain.disconnect();
      const currentVoices = this.activeVoices.get(padId);
      if (currentVoices) {
        const index = currentVoices.findIndex((v) => v.id === newVoice.id);
        if (index !== -1) {
          currentVoices.splice(index, 1);
        }
      }
    };

    source.start(now);
  }

  public setMasterVolume(volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const safeVol = Math.max(0, Math.min(1, volume)) * 0.8;
    this.masterGain.gain.setTargetAtTime(safeVol, this.ctx.currentTime, 0.05);
  }
}

export const audioEngine = new AudioEngine();