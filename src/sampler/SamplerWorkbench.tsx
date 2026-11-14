import React, { useState } from 'react';
import { AudioSampleDropzone } from '../components/AudioSampleDropzone';
import type { RecordingStatus } from '../audio/inputRecorder';
import type { BankId } from '../project/projectController';
import type { PadBankApi, PadSlot } from './usePadBank';
import { WaveformEditor } from './WaveformEditor';

export interface SamplerWorkbenchProps {
  pad: PadSlot;
  onUpdatePad: PadBankApi['updatePad'];
  onPreviewRange: PadBankApi['previewRange'];
  onLoadSample: PadBankApi['loadSample'];
  recordingStatus: RecordingStatus;
  onRecord: (padId: string) => void;
  storageReady: boolean;
  activeBank: BankId;
  onChop: PadBankApi['chopToBank'];
}

export const SamplerWorkbench: React.FC<SamplerWorkbenchProps> = ({
  pad, onUpdatePad, onPreviewRange, onLoadSample, recordingStatus, onRecord, storageReady, activeBank, onChop,
}) => {
  const [count, setCount] = useState(4);
  const [chopping, setChopping] = useState(false);
  const [chopMessage, setChopMessage] = useState('');
  const [chopError, setChopError] = useState(false);
  return (
  <div className="sampler-workbench bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col shrink-0 font-mono select-none">
    <div className="sampler-toolbar">
      <button type="button" disabled={!pad.buffer} onClick={() => onUpdatePad(pad.id, {
        playbackMode: pad.playbackMode === 'one-shot' ? 'gate' : pad.playbackMode === 'gate' ? 'loop' : 'one-shot',
      })}
        className={`sampler-mode rounded border text-[9px] font-bold disabled:opacity-40 ${
          pad.playbackMode !== 'one-shot' ? 'bg-purple-950 border-purple-800 text-purple-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'
        }`}>
        {pad.playbackMode.toUpperCase()}
      </button>
      <AudioSampleDropzone padId={pad.id} onSampleLoaded={onLoadSample} disabled={!storageReady} />
      <button type="button" disabled={!storageReady || recordingStatus.phase === 'processing'} onClick={() => onRecord(pad.id)}
        className="sampler-record rounded border border-rose-800 bg-rose-950 px-1 text-[9px] font-bold text-rose-300 disabled:opacity-40">
        {recordingStatus.phase === 'recording' ? 'STOP' : recordingStatus.phase === 'requesting' ? 'CANCEL' : recordingStatus.phase === 'processing' ? 'WAIT' : 'REC'}
      </button>
      <select id={`slice-count-${pad.id}`} aria-label="Number of slices" value={count} onChange={(event) => setCount(Number(event.target.value))}
        className="sampler-count bg-zinc-900 border border-zinc-700 rounded text-[9px] text-zinc-200">
        {Array.from({ length: 31 }, (_, index) => index + 2).map((number) => <option key={number} value={number}>{number}</option>)}
      </select>
      <button type="button" disabled={!storageReady || !pad.sampleKey || chopping} onClick={() => {
        setChopping(true);
        setChopMessage('');
        void onChop(pad.id, activeBank, count).then((ids) => {
          setChopError(false);
          setChopMessage(`ASSIGNED ${ids.length}: ${ids[0]} → ${ids[ids.length - 1]}`);
        }).catch((error: unknown) => {
          setChopError(true);
          setChopMessage(error instanceof Error ? error.message : 'Could not assign slices.');
        }).finally(() => setChopping(false));
      }} className="sampler-chop rounded border border-cyan-800 bg-cyan-950 font-bold text-[9px] text-cyan-300 disabled:opacity-40">
        {chopping ? 'SAVING…' : `TO EMPTY ${activeBank}`}
      </button>
    </div>
    <WaveformEditor pad={pad} onUpdatePad={onUpdatePad} onPreviewRange={onPreviewRange} sliceCount={count} />
    {chopMessage && <div role={chopError ? 'alert' : 'status'} className={`sampler-chop-status mb-2 text-[9px] break-words ${chopError ? 'text-rose-300' : 'text-cyan-300'}`}>{chopMessage}</div>}
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
