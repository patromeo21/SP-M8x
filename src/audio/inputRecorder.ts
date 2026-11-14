import { audioEngine } from './audioEngine';

export type RecordingStatus =
  | { phase: 'idle'; message?: string }
  | { phase: 'requesting'; padId: string }
  | { phase: 'recording'; padId: string }
  | { phase: 'processing'; padId: string }
  | { phase: 'error'; message: string };

const MAX_RECORDING_MS = 60_000;

export class InputRecorder {
  private status: RecordingStatus = { phase: 'idle' };
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: number | null = null;
  private generation = 0;
  private disposed = false;

  constructor(
    private onStatus: (status: RecordingStatus) => void,
    private onSample: (padId: string, buffer: AudioBuffer, name: string, audio: Blob) => void,
  ) {}

  private setStatus(status: RecordingStatus): void {
    this.status = status;
    if (!this.disposed) this.onStatus(status);
  }

  private releaseInput(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  async start(padId: string): Promise<void> {
    if (this.disposed || (this.status.phase !== 'idle' && this.status.phase !== 'error')) return;
    const generation = ++this.generation;
    this.setStatus({ phase: 'requesting', padId });
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Audio recording is unavailable. Use Safari on a secure connection.');
      }

      await audioEngine.initialize();
      if (generation !== this.generation) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const recorder = new MediaRecorder(stream);
      this.recorder = recorder;
      this.chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) this.chunks.push(event.data);
      };
      recorder.onerror = () => this.fail('Recording failed. Check your input device and try again.');
      recorder.onstop = () => void this.finish(generation, padId, recorder.mimeType);
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (this.status.phase === 'recording') this.fail('Audio input disconnected. Recording was not saved.');
        };
      });
      recorder.start();
      this.setStatus({ phase: 'recording', padId });
      this.timer = window.setTimeout(() => this.stop(), MAX_RECORDING_MS);
    } catch (error) {
      if (generation !== this.generation) return;
      console.error('[InputRecorder] Could not start recording:', error);
      this.fail(error instanceof Error ? error.message : 'Could not start recording. Check microphone permissions.');
    }
  }

  stop(): void {
    if (this.status.phase === 'requesting') {
      this.generation++;
      this.setStatus({ phase: 'idle', message: 'Recording cancelled.' });
      return;
    }
    if (this.status.phase !== 'recording' || !this.recorder) return;
    const padId = this.status.padId;
    this.setStatus({ phase: 'processing', padId });
    try {
      this.recorder.stop();
      this.releaseInput();
    } catch (error) {
      console.error('[InputRecorder] Could not stop recording:', error);
      this.fail('Could not finish recording.');
    }
  }

  private async finish(generation: number, padId: string, mimeType: string): Promise<void> {
    if (generation !== this.generation || this.status.phase !== 'processing') return;
    this.recorder = null;
    try {
      const blob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];
      if (!blob.size) throw new Error('The recording was empty.');
      const buffer = await audioEngine.decodeAudioData(await blob.arrayBuffer());
      if (generation !== this.generation) return;
      this.onSample(padId, buffer, `REC ${padId}`, blob);
      this.setStatus({ phase: 'idle', message: `Recorded to ${padId}.` });
    } catch (error) {
      if (generation !== this.generation) return;
      console.error('[InputRecorder] Could not decode recording:', error);
      this.fail('Could not decode recording. The previous sample was kept.');
    }
  }

  private fail(message: string): void {
    this.generation++;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (error) {
          console.error('[InputRecorder] Could not release recorder:', error);
        }
      }
    }
    this.releaseInput();
    this.chunks = [];
    this.setStatus({ phase: 'error', message });
  }

  dispose(): void {
    this.disposed = true;
    this.fail('Recording cancelled.');
  }
}
