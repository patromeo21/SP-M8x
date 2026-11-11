/**
 * SP-M8x Hybrid Music Production Suite
 * audioEngine.ts — Web Audio DSP Engine with Polyphonic Voice Stealing & Gain Staging
 * Located in src/audio/audioEngine.ts
 */

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
  
  private activeVoices: Map<string, ActiveVoice[]> = new Map();
  private maxVoicesPerPad: number = 4; // Polyphony limit per pad before voice stealing
  private isInitialized: boolean = false;

  constructor() {
    // Lazy initialization on first user interaction to satisfy mobile browser autoplay policies
  }

  public async initialize(): Promise<AnalyserNode | null> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return this.analyser;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Master Gain Staging Protection (-6dB headroom to prevent inter-sample clipping)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);

    // Dynamics Compressor / Limiter to clamp peaks and prevent digital distortion
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(6, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

    // Analyser Node for 120fps visualizer
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // Connect Node Graph: MasterGain -> Compressor -> Analyser -> Destination
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isInitialized = true;
    console.log('[SP-M8x AudioEngine] Initialized with gain staging protection & compressor limiter.');
    return this.analyser;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * Trigger an audio buffer sample with voice stealing & gain staging isolation
   */
  public triggerVoice(padId: string, buffer: AudioBuffer, playbackRate: number = 1.0): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    // Create isolated Source and Gain nodes per trigger
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, now);

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(1.0, now);

    // Connect voice: Source -> VoiceGain -> MasterGain
    source.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    // Retrieve existing voices for this pad slot
    if (!this.activeVoices.has(padId)) {
      this.activeVoices.set(padId, []);
    }
    const voices = this.activeVoices.get(padId)!;

    // Polyphony Voice Stealing: If max voices reached, stop and fade out the oldest voice
    if (voices.length >= this.maxVoicesPerPad) {
      const oldestVoice = voices.shift();
      if (oldestVoice) {
        try {
          oldestVoice.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.01);
          oldestVoice.source.stop(now + 0.01);
          oldestVoice.source.disconnect();
          oldestVoice.gainNode.disconnect();
        } catch {
          // Ignore errors if node already stopped
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

    // Clean up voice reference when playback ends naturally
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
    // Clamp volume between 0.0 and 1.0 with headroom safety
    const safeVol = Math.max(0, Math.min(1, volume)) * 0.8;
    this.masterGain.gain.setTargetAtTime(safeVol, this.ctx.currentTime, 0.05);
  }
}

export const audioEngine = new AudioEngine();