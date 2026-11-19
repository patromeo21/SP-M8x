import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { trackerEngine } from '../tracker/trackerEngine';
import { bounceFrameCount, encodeBounceWav, type BounceBars } from './bounceAudio';
import type { PadBankApi } from './usePadBank';

export function useBounceToPad(onSample: PadBankApi['loadSample']) {
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
        processorOptions: { startFrame: Math.round(bar.time * context.sampleRate), frameCount },
      });
      let disconnectMaster: (() => void) | null = null;
      cleanup.current = () => {
        unsubscribeStop();
        context.removeEventListener('statechange', onStateChange);
        disconnectMaster?.();
        node.port.onmessage = null;
        node.onprocessorerror = null;
        node.port.postMessage({ type: 'cancel' });
        node.port.close();
        node.disconnect();
        silence.disconnect();
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
      node.port.onmessage = (event: MessageEvent<{ left: Float32Array; right: Float32Array; length: number; error?: string }>) => {
        if (id !== generation.current) return;
        try {
          const { left, right, length, error } = event.data;
          if (error) throw new Error(error);
          if (length !== frameCount || left.length < length || right.length < length) throw new Error('Bounce capture was incomplete.');
          const buffer = context.createBuffer(2, length, context.sampleRate);
          buffer.getChannelData(0).set(left.subarray(0, length));
          buffer.getChannelData(1).set(right.subarray(0, length));
          const wav = encodeBounceWav(buffer);
          cleanup.current?.();
          cleanup.current = null;
          onSample(padId, buffer, `BOUNCE ${padId}`, wav);
          busy.current = false;
          setStatus({ busy: false, message: `Bounce sent to ${padId} (${bars} bar${bars === 1 ? '' : 's'}).`, error: false });
        } catch (error) {
          cleanup.current?.();
          cleanup.current = null;
          busy.current = false;
          setStatus({ busy: false, message: error instanceof Error ? error.message : 'Bounce failed.', error: true });
        }
      };
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
