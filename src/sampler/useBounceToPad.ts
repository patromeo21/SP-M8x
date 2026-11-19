import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { trackerEngine } from '../tracker/trackerEngine';
import { assignBounceToPad, bounceFrameCount, encodeBounceWav, releaseBounceCapture, type BounceBars } from './bounceAudio';
import type { PadBankApi } from './usePadBank';

type BounceWorkletMessage =
  | { type: 'complete'; left: Float32Array; right: Float32Array; length: number }
  | { type: 'error'; message: string }
  | { type: 'pending' };

export function useBounceToPad(onSample: PadBankApi['loadSample'], getPadSettings: PadBankApi['getPadSettings']) {
  const [status, setStatus] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: '', error: false });
  const generation = useRef(0);
  const cleanup = useRef<(() => void) | null>(null);
  const busy = useRef(false);

  useEffect(() => () => {
    generation.current++;
    busy.current = false;
    cleanup.current?.();
    cleanup.current = null;
  }, []);

  const cancel = (message = 'Bounce cancelled.') => {
    generation.current++;
    busy.current = false;
    cleanup.current?.();
    cleanup.current = null;
    setStatus({ busy: false, message, error: false });
  };

  const start = async (padId: string, bars: BounceBars) => {
    if (busy.current) return;
    busy.current = true;
    const id = ++generation.current;
    setStatus({ busy: true, message: `Preparing bounce to ${padId}...`, error: false });
    try {
      const context = await audioEngine.initialize();
      if (id !== generation.current) return;
      if (!context.audioWorklet || typeof AudioWorkletNode === 'undefined') {
        throw new Error('Bounce requires AudioWorklet support on a secure connection.');
      }
      trackerEngine.nextBar(context.currentTime);
      const onStateChange = () => {
        if (context.state !== 'running') cancel('Bounce cancelled because audio paused.');
      };
      const unsubscribeStop = trackerEngine.subscribeStop(() => cancel('Bounce cancelled because transport stopped.'));
      context.addEventListener('statechange', onStateChange);
      cleanup.current = () => {
        unsubscribeStop();
        context.removeEventListener('statechange', onStateChange);
      };
      await context.audioWorklet.addModule(new URL('./resamplingWorklet.js', import.meta.url).href);
      if (id !== generation.current) return;
      bounceFrameCount(context.sampleRate, trackerEngine.nextBar(context.currentTime).bpm, bars);
      const leftBuffer = new ArrayBuffer(context.sampleRate * 30 * Float32Array.BYTES_PER_ELEMENT);
      const rightBuffer = new ArrayBuffer(context.sampleRate * 30 * Float32Array.BYTES_PER_ELEMENT);
      const left = new Float32Array(leftBuffer);
      const right = new Float32Array(rightBuffer);
      const bar = trackerEngine.nextBar(context.currentTime + 0.1);
      const frameCount = bounceFrameCount(context.sampleRate, bar.bpm, bars);
      const silence = context.createGain();
      silence.gain.value = 0;
      const node = new AudioWorkletNode(context, 'sp-m8x-resampling', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });
      let disconnectMaster: (() => void) | null = null;
      let pollTimer: number | null = null;
      cleanup.current = () => {
        unsubscribeStop();
        context.removeEventListener('statechange', onStateChange);
        if (pollTimer !== null) window.clearTimeout(pollTimer);
        releaseBounceCapture(node, silence, disconnectMaster);
      };
      disconnectMaster = audioEngine.connectMasterCapture(node);
      node.connect(silence);
      silence.connect(context.destination);
      node.onprocessorerror = () => {
        if (id !== generation.current) return;
        cleanup.current?.();
        cleanup.current = null;
        generation.current++;
        busy.current = false;
        setStatus({ busy: false, message: 'Bounce audio processor failed.', error: true });
      };
      const pollMessage = { type: 'poll' };
      const schedulePoll = (delay: number) => {
        pollTimer = window.setTimeout(() => {
          pollTimer = null;
          node.port.postMessage(pollMessage);
        }, delay);
      };
      node.port.onmessage = (event: MessageEvent<BounceWorkletMessage>) => {
        if (id !== generation.current) return;
        try {
          if (event.data.type === 'error') throw new Error(event.data.message);
          if (event.data.type === 'pending') {
            const remaining = bar.time + frameCount / context.sampleRate - context.currentTime;
            schedulePoll(Math.max(25, remaining * 1000 + 25));
            return;
          }
          const { left, right, length } = event.data;
          if (length !== frameCount || left.length < length || right.length < length) throw new Error('Bounce capture was incomplete.');
          const buffer = context.createBuffer(2, length, context.sampleRate);
          buffer.getChannelData(0).set(left.subarray(0, length));
          buffer.getChannelData(1).set(right.subarray(0, length));
          const wav = encodeBounceWav(buffer);
          cleanup.current?.();
          cleanup.current = null;
          assignBounceToPad(padId, buffer, wav, onSample, getPadSettings);
          busy.current = false;
          setStatus({ busy: false, message: `Bounce sent to ${padId} (${bars} bar${bars === 1 ? '' : 's'}).`, error: false });
        } catch (error) {
          cleanup.current?.();
          cleanup.current = null;
          busy.current = false;
          setStatus({ busy: false, message: error instanceof Error ? error.message : 'Bounce failed.', error: true });
        }
      };
      const transfers = [leftBuffer, rightBuffer];
      node.port.postMessage({
        type: 'capture',
        startFrame: Math.round(bar.time * context.sampleRate),
        length: frameCount,
        left,
        right,
        result: { type: 'complete', left, right, length: frameCount },
        missed: { type: 'error', message: 'Bounce missed the bar boundary. Try again.' },
        pending: { type: 'pending' },
        transfers,
      }, transfers);
      schedulePoll(Math.max(0, (bar.time - context.currentTime) * 1000 + 50));
      setStatus({ busy: true, message: `Waiting for next bar · ${bars} bar${bars === 1 ? '' : 's'} to ${padId}`, error: false });
    } catch (error) {
      if (id !== generation.current) return;
      cleanup.current?.();
      cleanup.current = null;
      busy.current = false;
      setStatus({ busy: false, message: error instanceof Error ? error.message : 'Could not start bounce.', error: true });
    }
  };

  return { status, start, cancel };
}
