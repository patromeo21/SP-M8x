/**
 * SP-M8x Hybrid Music Production Suite
 * AudioVisualizerService.ts — Low-CPU Canvas Render Engine (Visualizer Loop)
 */

export class AudioVisualizerService {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;

  private dataArray: Uint8Array = new Uint8Array(0);

  public attach(canvas: HTMLCanvasElement, analyser: AnalyserNode): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.analyser = analyser;
    this.dataArray = new Uint8Array(analyser.frequencyBinCount);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.renderLoop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderLoop = (): void => {
    if (!this.isRunning || !this.canvas || !this.ctx || !this.analyser) return;

    this.animationFrameId = requestAnimationFrame(this.renderLoop);

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Type-cast buffer array explicitly to satisfy Web Audio AnalyserNode signature
    this.analyser.getByteTimeDomainData(this.dataArray as unknown as Uint8Array<ArrayBuffer>);

    this.ctx.fillStyle = '#09090b';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#22d3ee';
    this.ctx.beginPath();

    const sliceWidth = width / this.dataArray.length;
    let x = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const v = this.dataArray[i] / 128.0;
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
  };

  public detach(): void {
    this.stop();
    this.canvas = null;
    this.ctx = null;
    this.analyser = null;
  }
}

export const audioVisualizerService = new AudioVisualizerService();