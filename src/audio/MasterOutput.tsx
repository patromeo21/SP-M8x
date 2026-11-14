import React, { useEffect, useState } from 'react';
import { audioEngine } from './audioEngine';
import { projectController } from '../project/projectController';

export function MasterOutput() {
  const [volume, setVolume] = useState(projectController.getState().settings.masterVolume);
  const [peak, setPeak] = useState(0);

  useEffect(() => {
    audioEngine.setMasterVolume(volume);
  }, [volume]);

  useEffect(() => {
    const timer = window.setInterval(() => setPeak(audioEngine.getOutputPeak()), 200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2" title="Sampled stereo peak; brief peaks between readings can be missed. This is not a limiter.">
      <label className="flex items-center gap-1">
        MASTER
        <input aria-label="Master volume" type="range" min="0" max="1" step="0.01" value={volume}
          onChange={(event) => {
            const value = Number(event.target.value);
            setVolume(value);
            projectController.setMasterVolume(value);
          }} className="w-16" />
      </label>
      <span className={peak >= 1 ? 'text-rose-400 font-bold' : 'text-zinc-300'}>
        PEAK {peak > 0 ? `${(20 * Math.log10(peak)).toFixed(1)} dBFS` : '−∞'}
      </span>
    </div>
  );
}
