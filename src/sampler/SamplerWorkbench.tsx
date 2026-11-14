import React, { useEffect, useRef, useState } from 'react';
import { AudioSampleDropzone } from '../components/AudioSampleDropzone';
import type { RecordingStatus } from '../audio/inputRecorder';
import type { BankId } from '../project/projectController';
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
  activeBank: BankId;
  onChop: PadBankApi['chopToBank'];
}

export const SamplerWorkbench: React.FC<SamplerWorkbenchProps> = ({
  pad, onUpdatePad, onLoadSample, onAudition, recordingStatus, onRecord, storageReady, activeBank, onChop,
}) => {
  const auditions = useRef(new Map<number, () => void>());
  const [count, setCount] = useState(4);
  const [chopping, setChopping] = useState(false);
  const [chopMessage, setChopMessage] = useState('');
  const [chopError, setChopError] = useState(false);
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
    <WaveformEditor pad={pad} onUpdatePad={onUpdatePad} sliceCount={count} />
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
    <div className="sampler-chop flex items-center gap-1 mb-2 text-[10px]">
      <label className="text-zinc-400" htmlFor={`slice-count-${pad.id}`}>CHOP</label>
      <select id={`slice-count-${pad.id}`} aria-label="Number of slices" value={count} onChange={(event) => setCount(Number(event.target.value))}
        className="bg-zinc-900 border border-zinc-700 rounded px-1 py-1 text-zinc-200">
        {[2, 4, 8, 16].map((number) => <option key={number} value={number}>{number}</option>)}
      </select>
      <button type="button" disabled={!storageReady || !pad.sampleKey || chopping} onClick={() => {
        setChopping(true);
        setChopMessage('');
        void onChop(pad.id, activeBank, count).then((ids) => {
          setChopError(false);
          setChopMessage(`ASSIGNED ${ids.join(', ')}`);
        }).catch((error: unknown) => {
          setChopError(true);
          setChopMessage(error instanceof Error ? error.message : 'Could not assign slices.');
        }).finally(() => setChopping(false));
      }} className="flex-1 rounded border border-cyan-800 bg-cyan-950 py-1 font-bold text-cyan-300 disabled:opacity-40">
        {chopping ? 'SAVING…' : `TO EMPTY PADS · BANK ${activeBank}`}
      </button>
    </div>
    {chopMessage && <div role={chopError ? 'alert' : 'status'} className={`sampler-chop-status mb-2 text-[9px] break-words ${chopError ? 'text-rose-300' : 'text-cyan-300'}`}>{chopMessage}</div>}
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
