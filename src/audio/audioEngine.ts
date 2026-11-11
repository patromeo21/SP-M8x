/**
 * SP-M8x Hybrid Music Production Suite
 * audioEngine.ts — Web Audio API Core Engine & Polyphonic Voice Allocation
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeVoices: Map<string, { source: AudioBufferSourceNode; gain: GainNode }> = new Map();

  constructor() {
    // Lazy initialization on user interaction to comply with browser audio policies
  }

  public initialize(context?: AudioContext): AudioContext {
    if (!this.ctx) {
      this.ctx = context || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  /**
     * Triggers a voice for a given pad ID.
     * Arguments are optional to ensure seamless compatibility with workbench previews and UI triggers.
     */
  public triggerVoice(padId: string, buffer?: AudioBuffer, pan: number = 0): void {
    const context = this.initialize();
    
    // Stop existing voice on this pad to prevent polyphonic clipping/overlap
    this.stopVoice(padId);

    if (!this.masterGain) return;

    // If a buffer is provided, play it; otherwise, synthesize a clean click/preview sound
    const source = context.createBufferSource();
    if (buffer) {
      source.buffer = buffer;
    } else {
      // Create a short fallback buffer click for testing workbench triggers
      const fallbackBuffer = context.createBuffer(1, context.sampleRate * 0.1, context.sampleRate);
      const data = fallbackBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.sin(i * 0.2) * Math.exp(-i / (context.sampleRate * 0.02));
      }
      source.buffer = fallbackBuffer;
    }

    const voiceGain = context.createGain();
    voiceGain.gain.setValueAtTime(1.0, context.currentTime);

    // Wire: Source -> VoiceGain -> MasterGain
    source.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    source.start(0);
    this.activeVoices.set(padId, { source, gain: voiceGain });

    source.onended = () => {
      this.activeVoices.delete(padId);
    };
  }

  public stopVoice(padId: string): void {
    const voice = this.activeVoices.get(padId);
    if (voice) {
      try {
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
      } catch {
        // Ignore if already stopped
      }
      this.activeVoices.delete(padId);
    }
  }

  public setMasterVolume(volume: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.01);
    }
  }
}

export const audioEngine = new AudioEngine();
export default audioEngine;