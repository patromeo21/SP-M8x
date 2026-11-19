export type BounceBars = 1 | 2 | 4 | 8;

export function assignBounceToPad(
  padId: string,
  buffer: AudioBuffer,
  wav: Blob,
  onSample: (padId: string, buffer: AudioBuffer, name: string, audio: Blob) => void,
  getPad: (padId: string) => { buffer: AudioBuffer | null } | undefined,
): void {
  if (!getPad(padId)) throw new Error(`Pad ${padId} is unavailable.`);
  onSample(padId, buffer, `BOUNCE ${padId}`, wav);
  if (getPad(padId)?.buffer !== buffer) {
    throw new Error(`Bounce was not assigned to ${padId}; the pad may be reserved.`);
  }
}

export function releaseBounceCapture(
  node: AudioWorkletNode,
  silence: GainNode,
  disconnectMaster: (() => void) | null,
): void {
  disconnectMaster?.();
  node.port.onmessage = null;
  node.onprocessorerror = null;
  node.port.postMessage({ type: 'cancel' });
  node.port.close();
  node.disconnect();
  silence.disconnect();
}

export function bounceFrameCount(sampleRate: number, bpm: number, bars: BounceBars): number {
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new RangeError('Invalid sample rate.');
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('Invalid tempo.');
  if (bars !== 1 && bars !== 2 && bars !== 4 && bars !== 8) throw new RangeError('Invalid bounce length.');
  const frames = Math.round(sampleRate * 240 * bars / bpm);
  if (frames < 1 || frames > sampleRate * 30) throw new RangeError('Bounce exceeds the 30-second capture limit.');
  return frames;
}

export function encodeBounceWav(buffer: AudioBuffer): Blob {
  const length = buffer.length;
  const bytes = new ArrayBuffer(44 + length * 4);
  const view = new DataView(bytes);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, length * 4, true);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(44 + i * 4, Math.round(l < 0 ? l * 32768 : l * 32767), true);
    view.setInt16(46 + i * 4, Math.round(r < 0 ? r * 32768 : r * 32767), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
