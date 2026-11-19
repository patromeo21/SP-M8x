import React, { useState } from 'react';
import { AudioSampleDropzone } from '../components/AudioSampleDropzone';
import type { RecordingStatus } from '../audio/inputRecorder';
import type { BankId } from '../project/projectController';
import type { PadBankApi, PadSlot } from './usePadBank';
import type { AudioWaveformCanvasProps } from './AudioWaveformCanvas';
import { WaveformEditor } from './WaveformEditor';
import { useBounceToPad } from './useBounceToPad';
import type { BounceBars } from './bounceAudio';

const BOUNCE_BARS: readonly BounceBars[] = [1, 2, 4, 8];

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
  onGenerateSliceMarkers: PadBankApi['generateSliceMarkers'];
  renderWaveform: (props: Omit<AudioWaveformCanvasProps, 'audioBuffer'>) => React.ReactNode;
}

export const SamplerWorkbench: React.FC<SamplerWorkbenchProps> = ({
  pad, onUpdatePad, onPreviewRange, onLoadSample, recordingStatus, onRecord, storageReady, activeBank, onChop, onGenerateSliceMarkers, renderWaveform,
}) => {
  const [count, setCount] = useState<number | null>(null);
  const [chopping, setChopping] = useState(false);
  const [chopMessage, setChopMessage] = useState('');
  const [chopError, setChopError] = useState(false);
  const [bounceBars, setBounceBars] = useState<BounceBars>(1);
  const bounce = useBounceToPad(onLoadSample);
  return (
  <div className="sampler-workbench bg-[var(--bg-canvas)] flex flex-col shrink-0 font-mono select-none">
    <WaveformEditor pad={pad} onUpdatePad={onUpdatePad} onPreviewRange={onPreviewRange}
      sliceCount={count ?? 0} renderWaveform={renderWaveform} />
    <div className="sampler-toolbar">
      <button type="button" disabled={!pad.buffer} onClick={() => onUpdatePad(pad.id, {
        playbackMode: pad.playbackMode === 'one-shot' ? 'gate' : pad.playbackMode === 'gate' ? 'loop' : 'one-shot',
      })}
        aria-label={`Playback mode ${pad.playbackMode}`}
        className={`sampler-mode chop-action text-[9px] font-bold disabled:opacity-40 ${
          pad.playbackMode !== 'one-shot' ? 'text-purple-300' : 'text-zinc-400'
        }`}>
        {pad.playbackMode.toUpperCase()}
      </button>
      <AudioSampleDropzone padId={pad.id} onSampleLoaded={onLoadSample} disabled={!storageReady} />
      <button type="button" disabled={!storageReady || recordingStatus.phase === 'processing'} onClick={() => onRecord(pad.id)}
        className="sampler-record chop-action px-1 text-[9px] font-bold text-rose-300 disabled:opacity-40">
        {recordingStatus.phase === 'recording' ? 'STOP' : recordingStatus.phase === 'requesting' ? 'CANCEL' : recordingStatus.phase === 'processing' ? 'WAIT' : 'REC'}
      </button>
      <select aria-label="Bounce length in bars" value={bounceBars} disabled={bounce.status.busy}
        onChange={(event) => {
          const bars = BOUNCE_BARS.find((value) => String(value) === event.target.value);
          if (bars !== undefined) setBounceBars(bars);
        }}
        className="bg-zinc-900 border border-zinc-700 rounded text-[9px] text-zinc-200">
        {BOUNCE_BARS.map((bars) => <option key={bars} value={bars}>{bars} BAR{bars === 1 ? '' : 'S'}</option>)}
      </select>
      <button type="button" disabled={!storageReady && !bounce.status.busy}
        onClick={() => bounce.status.busy ? bounce.cancel() : void bounce.start(pad.id, bounceBars)}
        className="chop-action px-1 text-[9px] font-bold text-cyan-300 disabled:opacity-40">
        {bounce.status.busy ? 'CANCEL BOUNCE' : `BOUNCE TO ${pad.id}`}
      </button>
      <select id={`slice-count-${pad.id}`} aria-label="Number of slices" value={count ?? ''}
        disabled={!storageReady || !pad.sampleKey || chopping}
        onChange={(event) => {
          const nextCount = event.target.value ? Number(event.target.value) : null;
          setCount(nextCount);
          setChopMessage('');
          if (nextCount === null) return;
          setChopping(true);
          void onGenerateSliceMarkers(pad.id, nextCount).then(() => {
            setChopError(false);
            setChopMessage(`SAVED ${nextCount} SLI MARKERS`);
          }).catch((error: unknown) => {
            setChopError(true);
            setChopMessage(error instanceof Error ? error.message : 'Could not save markers.');
          }).finally(() => setChopping(false));
        }}
        className="sampler-count bg-zinc-900 border border-zinc-700 rounded text-[9px] text-zinc-200">
        <option value="">CHOP</option>
        {Array.from({ length: 31 }, (_, index) => index + 2).map((number) => <option key={number} value={number}>{number}</option>)}
      </select>
      {count !== null && <button type="button" disabled={!storageReady || !pad.sampleKey || chopping} onClick={() => {
        setChopping(true);
        setChopMessage('');
        void onChop(pad.id, activeBank, count).then((ids) => {
          setChopError(false);
          setChopMessage(`ASSIGNED ${ids.length}: ${ids[0]} → ${ids[ids.length - 1]}`);
        }).catch((error: unknown) => {
          setChopError(true);
          setChopMessage(error instanceof Error ? error.message : 'Could not assign slices.');
        }).finally(() => setChopping(false));
      }} className="sampler-chop rounded border border-cyan-800 bg-cyan-950/30 font-bold text-[9px] text-cyan-300 disabled:opacity-40">
        {chopping ? 'SAVING…' : `TO EMPTY ${activeBank}`}
      </button>}
    </div>
    {chopMessage && <div role={chopError ? 'alert' : 'status'} className={`sampler-chop-status mb-2 text-[9px] break-words ${chopError ? 'text-rose-300' : 'text-cyan-300'}`}>{chopMessage}</div>}
    {bounce.status.message && <div role={bounce.status.error ? 'alert' : 'status'} className={`text-[9px] ${bounce.status.error ? 'text-rose-300' : 'text-cyan-300'}`}>{bounce.status.message}</div>}
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
