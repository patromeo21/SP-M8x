/**
 * SP-M8x Web Audio Engine
 * High-Performance Low-Latency Audio Service optimized for Mobile Safari / iPad 9th Gen
 */

export interface ActiveVoice {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  padId: number;
  startTime: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeVoices: Map<string, ActiveVoice> = new Map();
  private buffers: Map<number, AudioBuffer> = new Map();

  constructor() {
    // AudioContext is initialized lazily upon first touch/interaction
    // to comply with WebAudio autoplay policies on iOS Safari.
  }

  /**
   * Initializes or resumes the AudioContext singleton.
   */
  public async init(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass({
        latencyHint: 'interactive',
      });

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    return this.ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Decodes array buffer audio data with a sliced array buffer memory safeguard
   * to prevent buffer detachment crashes on Safari engines.
   */
  public async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const context = await this.init();
    // Use .slice(0) to prevent detached ArrayBuffer reference exceptions in Web Audio decoders
    return await context.decodeAudioData(arrayBuffer.slice(0));
  }

  public setPadBuffer(padId: number, buffer: AudioBuffer): void {
    this.buffers.set(padId, buffer);
  }

  public getPadBuffer(padId: number): AudioBuffer | undefined {
    return this.buffers.get(padId);
  }

  /**
   * Polyphonic Voice Allocator & Trigger Service
   * Calculates MPC chromatic pitch shift: playbackRate = 2 ^ (semitoneOffset / 12)
   */
  public triggerPad(
    padId: number,
    options: {
      sliceStart?: number;
      sliceEnd?: number;
      volume?: number;
      semitoneOffset?: number;
      loop?: boolean;
    } = {}
  ): string | null {
    if (!this.ctx || !this.masterGain) return null;
    const buffer = this.buffers.get(padId);
    if (!buffer) return null;

    const {
      sliceStart = 0,
      sliceEnd = buffer.duration,
      volume = 1.0,
      semitoneOffset = 0,
      loop = false,
    } = options;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    // MPC Chromatic Pitch Engine calculation: playbackRate = 2^(semitoneOffset / 12)
    const playbackRate = Math.pow(2, semitoneOffset / 12);
    // Clamp playbackRate to prevent browser audio context exceptions
    source.playbackRate.value = Math.max(0.0625, Math.min(16.0, playbackRate));

    // De-click envelope / gain node creation
    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime);

    source.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    const duration = sliceEnd - sliceStart;
    const safeStart = Math.max(0, Math.min(sliceStart, buffer.duration));
    const safeDuration = Math.max(0.01, Math.min(duration, buffer.duration - safeStart));

    const voiceId = `spm8x_${padId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const activeVoice: ActiveVoice = {
      source,
      gainNode: voiceGain,
      padId,
      startTime: this.ctx.currentTime,
    };

    this.activeVoices.set(voiceId, activeVoice);

    source.onended = () => {
      try {
        source.disconnect();
        voiceGain.disconnect();
      } catch {
        // Disconnected cleanly
      }
      this.activeVoices.delete(voiceId);
    };

    try {
      if (safeStart > 0 || safeDuration < buffer.duration) {
        source.start(this.ctx.currentTime, safeStart, safeDuration);
      } else {
        source.start(this.ctx.currentTime);
      }
    } catch (e) {
      console.error('SP-M8x AudioEngine trigger exception:', e);
      return null;
    }

    return voiceId;
  }

  /**
   * Stops a specific active voice with a 10ms exponential anti-pop gain ramp down.
   */
  public stopVoice(voiceId: string): void {
    const voice = this.activeVoices.get(voiceId);
    if (voice && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
        voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.01);
        voice.source.stop(now + 0.01);
      } catch {
        // Voice already terminated
      }
      this.activeVoices.delete(voiceId);
    }
  }

  /**
   * Immediately silences all active playback voices.
   */
  public stopAllVoices(): void {
    for (const voiceId of this.activeVoices.keys()) {
      this.stopVoice(voiceId);
    }
  }

  /**
   * Updates master output gain (0.0 to 1.0).
   */
  public setMasterVolume(val: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, val)), this.ctx.currentTime);
    }
  }
}

export const audioEngine = new AudioEngine();
