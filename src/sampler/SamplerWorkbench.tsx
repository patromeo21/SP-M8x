/**
 * SP-M8x Hybrid Music Production Suite
 * SamplerWorkbench.tsx — Waveform / slicing workbench for the selected pad
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { AudioSampleDropzone } from '../components/AudioSampleDropzone';
import { formatPadLabel, type PadBankApi, type PadSlot } from './usePadBank';
import type { RecordingStatus } from '../audio/inputRecorder';

const WAVE_COLUMNS = 240;

export interface SamplerWorkbenchProps {
  pad: PadSlot;
  onUpdatePad: PadBankApi['updatePad'];
  onLoadSample: PadBankApi['loadSample'];
  onAudition: PadBankApi['triggerPad'];
  recordingStatus: RecordingStatus;
  onRecord: (padId: string) => void;
}

const computePeaks = (buffer: AudioBuffer): Float32Array => {
  const peaks = new Float32Array(WAVE_COLUMNS);
  const channel = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / WAVE_COLUMNS));
  for (let col = 0; col < WAVE_COLUMNS; col++) {
    let max = 0;
    const from = col * block;
    const to = Math.min(channel.length, from + block);
    for (let i = from; i < to; i++) max = Math.max(max, Math.abs(channel[i]));
    peaks[col] = max;
  }
  return peaks;
};

export const SamplerWorkbench: React.FC<SamplerWorkbenchProps> = ({
  pad,
  onUpdatePad,
  onLoadSample,
  onAudition,
  recordingStatus,
  onRecord,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaks = useMemo(() => (pad.buffer ? computePeaks(pad.buffer) : null), [pad.buffer]);
  const duration = pad.buffer?.duration ?? 0;
  const sampleRate = pad.buffer?.sampleRate ?? 44100;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    if (!peaks) return;

    const mid = height / 2;
    const colWidth = width / WAVE_COLUMNS;
    ctx.fillStyle = '#c084fc';
    for (let col = 0; col < WAVE_COLUMNS; col++) {
      const h = Math.max(1, peaks[col] * (height - 8));
      ctx.fillRect(col * colWidth, mid - h / 2, Math.max(1, colWidth - 0.5), h);
    }

    ctx.fillStyle = 'rgba(9, 9, 11, 0.72)';
    ctx.fillRect(0, 0, (pad.startPct / 100) * width, height);
    ctx.fillRect((pad.endPct / 100) * width, 0, width, height);
    ctx.fillStyle = '#22D3EE';
    ctx.fillRect((pad.startPct / 100) * width, 0, 2, height);
    ctx.fillRect((pad.endPct / 100) * width - 2, 0, 2, height);
  }, [peaks, pad.startPct, pad.endPct]);

  const update = (patch: Parameters<PadBankApi['updatePad']>[1]) => onUpdatePad(pad.id, patch);

  return (
    <div className="sampler-workbench bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col shrink-0 min-h-[160px] font-mono select-none">
      <div className="sampler-heading flex items-center justify-between border-b border-[var(--border-grid)] pb-2 mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-bold text-purple-400 tracking-wider">SAMPLER WORKBENCH</span>
          <span className="text-[9px] bg-purple-950 text-[var(--accent-table)] border border-purple-500/40 px-1.5 py-0.5 rounded font-bold">
            {formatPadLabel(pad.id)}
          </span>
        </div>
        <span className="text-[9px] text-zinc-400">
          RATE: <strong className="text-zinc-200">{sampleRate}HZ</strong>
        </span>
      </div>

      <div className="sampler-waveform relative h-24 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden mb-2 shrink-0">
        <canvas ref={canvasRef} width={600} height={96} className="absolute inset-0 w-full h-full" />
        {!pad.buffer && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 text-[11px]">
            <span className="text-zinc-400 font-bold mb-1">NO SAMPLE LOADED</span>
            <span className="text-[9px] text-zinc-600 tracking-widest">Waveform View / Slicing Grid</span>
          </div>
        )}
        {pad.buffer && (
          <>
            <span className="absolute top-1 left-2 text-[8px] text-purple-400 font-bold truncate max-w-[60%]">
              {pad.name}
            </span>
            <span className="absolute top-1 right-2 text-[8px] text-purple-400 font-bold">
              DUR: {duration.toFixed(2)}S
            </span>
          </>
        )}
      </div>

      <div className="sampler-sliders grid grid-cols-3 gap-2 mb-2">
        <SliderCell label="START" display={`${pad.startPct}%`} min={0} max={99} value={pad.startPct} disabled={!pad.buffer}
          onChange={(value) => update({ startPct: value })} />
        <SliderCell label="END" display={`${pad.endPct}%`} min={1} max={100} value={pad.endPct} disabled={!pad.buffer}
          onChange={(value) => update({ endPct: value })} />
        <SliderCell label="PITCH" display={`${pad.pitch > 0 ? '+' : ''}${pad.pitch}ST`} min={-12} max={12} value={pad.pitch}
          disabled={!pad.buffer} onChange={(value) => update({ pitch: value })} />
      </div>

      <div className="sampler-actions flex items-center gap-2 mb-2">
        <button
          type="button"
          disabled={!pad.buffer}
          onPointerDown={() => onAudition(pad.id)}
          className="flex-1 touch-none py-2 rounded bg-cyan-950 border border-cyan-800 text-[10px] font-bold text-[var(--accent-phrase)] disabled:opacity-40 active:scale-95 transition-all"
        >
          AUDITION
        </button>
        <button
          type="button"
          disabled={!pad.buffer}
          onClick={() => update({ loop: !pad.loop })}
          className={`flex-1 py-2 rounded border text-[10px] font-bold disabled:opacity-40 transition-all ${
            pad.loop
              ? 'bg-purple-950 border-purple-800 text-purple-300'
              : 'bg-zinc-900 border-zinc-700 text-zinc-400'
          }`}
        >
          {pad.loop ? 'LOOP' : 'ONE-SHOT'}
        </button>
      </div>

      <div className="sampler-input flex items-stretch gap-1 min-w-0">
        <AudioSampleDropzone padId={pad.id} onSampleLoaded={onLoadSample} />
        <button
          type="button"
          disabled={recordingStatus.phase === 'processing'}
          onClick={() => onRecord(pad.id)}
          className="shrink-0 rounded-lg border border-rose-800 bg-rose-950 px-2 text-[10px] font-bold text-rose-300 disabled:opacity-40"
        >
          {recordingStatus.phase === 'recording' ? 'STOP' : recordingStatus.phase === 'requesting' ? 'CANCEL' : recordingStatus.phase === 'processing' ? 'WAIT' : 'REC'}
        </button>
      </div>
      {recordingStatus.phase !== 'idle' || recordingStatus.message ? (
        <div role={recordingStatus.phase === 'error' ? 'alert' : 'status'} className="sampler-record-status text-[9px] text-rose-300">
          {recordingStatus.phase === 'recording' ? `REC ${recordingStatus.padId} · MAX 60S` :
            recordingStatus.phase === 'requesting' ? `REQUESTING INPUT FOR ${recordingStatus.padId}` :
            recordingStatus.phase === 'processing' ? `PROCESSING ${recordingStatus.padId}` : recordingStatus.message}
        </div>
      ) : null}
    </div>
  );
};

interface SliderCellProps {
  label: string;
  display: string;
  min: number;
  max: number;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

const SliderCell: React.FC<SliderCellProps> = ({ label, display, min, max, value, disabled, onChange }) => (
  <div className="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded p-1.5">
    <div className="flex justify-between text-[8px] mb-1">
      <span className="text-zinc-400 font-bold">{label}</span>
      <span className="text-[var(--accent-table)]">{display}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-[var(--accent-table)] cursor-pointer h-1 bg-zinc-800 rounded disabled:opacity-40"
    />
  </div>
);

export default SamplerWorkbench;
