import React, { useEffect, useRef } from 'react';
import { AudioSampleDropzone } from '../components/AudioSampleDropzone';
import type { RecordingStatus } from '../audio/inputRecorder';
import type { PadBankApi, PadSlot } from './usePadBank';
import { WaveformEditor } from './WaveformEditor';

export interface SamplerWorkbenchProps {
  pad: PadSlot;
  onUpdatePad: PadBankApi['updatePad'];
  onLoadSample: PadBankApi['loadSample'];
  onAudition: PadBankApi['triggerPad'];
  recordingStatus: RecordingStatus;
  onRecord: (padId: string) => void;
  storageReady: boolean;
}

export const SamplerWorkbench: React.FC<SamplerWorkbenchProps> = ({
  pad, onUpdatePad, onLoadSample, onAudition, recordingStatus, onRecord, storageReady,
}) => {
  const auditions = useRef(new Map<number, () => void>());
  useEffect(() => {
    const active = auditions.current;
    return () => {
      for (const release of active.values()) release();
      active.clear();
    };
  }, []);
  const endAudition = (event: React.PointerEvent<HTMLButtonElement>) => {
    auditions.current.get(event.pointerId)?.();
    auditions.current.delete(event.pointerId);
  };
  return (
  <div className="sampler-workbench bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col shrink-0 font-mono select-none">
    <WaveformEditor pad={pad} onUpdatePad={onUpdatePad} />
    <div className="sampler-actions flex items-center gap-2 mb-2">
      <button type="button" disabled={!pad.buffer} onPointerDown={(event) => {
        if (auditions.current.has(event.pointerId)) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        auditions.current.set(event.pointerId, onAudition(pad.id));
      }} onPointerUp={endAudition} onPointerCancel={endAudition} onLostPointerCapture={endAudition}
        className="flex-1 touch-none py-2 rounded bg-cyan-950 border border-cyan-800 text-[10px] font-bold text-[var(--accent-phrase)] disabled:opacity-40 active:scale-95">
        AUDITION
      </button>
      <button type="button" disabled={!pad.buffer} onClick={() => onUpdatePad(pad.id, {
        playbackMode: pad.playbackMode === 'one-shot' ? 'gate' : pad.playbackMode === 'gate' ? 'loop' : 'one-shot',
      })}
        className={`flex-1 py-2 rounded border text-[10px] font-bold disabled:opacity-40 ${
          pad.playbackMode !== 'one-shot' ? 'bg-purple-950 border-purple-800 text-purple-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'
        }`}>
        {pad.playbackMode.toUpperCase()}
      </button>
    </div>
    <div className="sampler-input flex items-stretch gap-1 min-w-0">
      <AudioSampleDropzone padId={pad.id} onSampleLoaded={onLoadSample} disabled={!storageReady} />
      <button type="button" disabled={!storageReady || recordingStatus.phase === 'processing'} onClick={() => onRecord(pad.id)}
        className="shrink-0 rounded-lg border border-rose-800 bg-rose-950 px-2 text-[10px] font-bold text-rose-300 disabled:opacity-40">
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

export default SamplerWorkbench;
