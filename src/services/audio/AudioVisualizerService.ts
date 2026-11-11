/**
 * SP-M8x Hybrid Music Production Suite
 * AudioVisualizerService.ts — High-Performance Canvas Waveform & Spectrum Visualizer
 */

export interface VisualizerOptions {
  canvas: HTMLCanvasElement;
  analyser: AnalyserNode;
  mode?: 'waveform' | 'frequency';
  lineColor?: string;
  backgroundColor?: string;
  targetFps?: number; // Supports up to 120fps for high-refresh displays
}

export class AudioVisualizerService {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private analyser: AnalyserNode;
  private mode: 'waveform' | 'frequency';
  private lineColor: string;
  private backgroundColor: string;
  private targetFps: number;

  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private dataArray: Uint8Array<ArrayBuffer>;
  private isRunning: boolean = false;

  constructor(options: VisualizerOptions) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.analyser = options.analyser;
    this.mode = options.mode ?? 'waveform';
    this.lineColor = options.lineColor ?? '#38bdf8'; // Cyan-400
    this.backgroundColor = options.backgroundColor ?? '#09090b'; // Zinc-950
    this.targetFps = options.targetFps ?? 120; // Default max resolution target

    // Configure analyser
    this.analyser.fftSize = 2048;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(new ArrayBuffer(bufferLength));
  }

  public setMode(mode: 'waveform' | 'frequency'): void {
    this.mode = mode;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.renderLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const interval = 1000 / this.targetFps;
    const delta = now - this.lastFrameTime;

    // Frame pacing to match targetFps (e.g., 120fps under demand threshold)
    if (delta >= interval) {
      this.lastFrameTime = now - (delta % interval);
      this.draw();
    }

    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  private draw(): void {
    if (!this.ctx || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear background
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);

    if (this.mode === 'waveform') {
      this.analyser.getByteTimeDomainData(this.dataArray);
      
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = this.lineColor;
      this.ctx.beginPath();

      const sliceWidth = width / this.dataArray.length;
      let x = 0;

      for (let i = 0; i < this.dataArray.length; i++) {
        const v = this.dataArray[i] / 128.0; // 0..255 normalized around 128
        const y = (v * height) / 2;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.ctx.lineTo(width, height / 2);
      this.ctx.stroke();
    } else {
      this.analyser.getByteFrequencyData(this.dataArray);

      const barWidth = (width / this.dataArray.length) * 2.5;
      let barHeight: number;
      let x = 0;

      for (let i = 0; i < this.dataArray.length; i++) {
        barHeight = (this.dataArray[i] / 255) * height;

        this.ctx.fillStyle = this.lineColor;
        this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
        if (x > width) break;
      }
    }
  }
}
