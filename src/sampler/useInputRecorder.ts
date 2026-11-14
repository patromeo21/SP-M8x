import { useEffect, useRef, useState } from 'react';
import { InputRecorder, type RecordingStatus } from '../audio/inputRecorder';
import type { PadBankApi } from './usePadBank';

export function useInputRecorder(onSample: PadBankApi['loadSample']) {
  const [status, setStatus] = useState<RecordingStatus>({ phase: 'idle' });
  const recorder = useRef<InputRecorder | null>(null);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') recorder.current?.stop();
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden);
      recorder.current?.dispose();
      recorder.current = null;
    };
  }, []);

  const toggle = (padId: string) => {
    if (!recorder.current) recorder.current = new InputRecorder(setStatus, onSample);
    if (status.phase === 'recording' || status.phase === 'requesting') {
      recorder.current.stop();
    } else if (status.phase !== 'processing') {
      void recorder.current.start(padId);
    }
  };

  return { status, toggle };
}
