export class TransportController {
  private audioCtx: AudioContext;
  private bpm: number = 120;
  private isPlaying: boolean = false;
  private metronomeEnabled: boolean = false;
  private timerId: number | null = null;
  private currentStep: number = 0;
  private onStepCallback: (step: number) => void;
  private spacebarListener: ((e: KeyboardEvent) => void) | null = null;

  constructor(audioCtx: AudioContext, onStep: (step: number) => void) {
    this.audioCtx = audioCtx;
    this.onStepCallback = onStep;
    this.initSpacebarTransport();
  }

  public setBpm(newBpm: number) {
    this.bpm = Math.max(40, Math.min(300, Math.floor(newBpm)));
    if (this.isPlaying) {
      this.restartInterval();
    }
  }

  public getBpm(): number {
    return this.bpm;
  }

  public toggleMetronome(): boolean {
    this.metronomeEnabled = !this.metronomeEnabled;
    return this.metronomeEnabled;
  }

  public isMetronomeActive(): boolean {
    return this.metronomeEnabled;
  }

  public start() {
    if (this.isPlaying) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.isPlaying = true;
    this.currentStep = 0;
    this.restartInterval();
  }

  public stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.currentStep = 0;
  }

  public togglePlay(): boolean {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  private restartInterval() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
    }
    // 16th note interval = (60 seconds / BPM) / 4 beats
    const intervalMs = (60000 / this.bpm) / 4;

    this.timerId = window.setInterval(() => {
      this.onStepCallback(this.currentStep);
      
      if (this.metronomeEnabled && this.currentStep % 4 === 0) {
        this.playMetronomeClick(this.currentStep === 0);
      }

      this.currentStep = (this.currentStep + 1) % 64;
    }, intervalMs);
  }

  private playMetronomeClick(isDownbeat: boolean) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isDownbeat ? 1000 : 800, this.audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.05);
  }

  private initSpacebarTransport() {
    this.spacebarListener = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      }
    };
    window.addEventListener('keydown', this.spacebarListener);
  }

  public dispose() {
    this.stop();
    if (this.spacebarListener) {
      window.removeEventListener('keydown', this.spacebarListener);
    }
  }
}