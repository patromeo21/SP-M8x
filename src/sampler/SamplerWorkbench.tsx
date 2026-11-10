/**
 * SP-M8x Sampler Workspace
 * SamplerWorkbench.tsx — Sample editing workbench for slicing, looping, and parameter tuning
 */

import React from 'react';
import { Pad } from '../types';
import { audioEngine } from '../audioEngine';

interface SamplerWorkbenchProps {
  selectedPad: Pad | undefined;
  onUpdatePad: (updatedPad: Pad) => void;
  onTriggerPad: (padId: number) => void;
}

export const SamplerWorkbench: React.FC<SamplerWorkbenchProps> = ({
  selectedPad,
  onUpdatePad,
  onTriggerPad,
}) => {
  if (!selectedPad) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-zinc-500 font-mono">
        <p>No Pad Selected</p>
        <span className="text-xs text-zinc-600 mt-1">Select a pad from the 16-pad matrix to edit sample parameters.</span>
      </div>
    );
  }

  const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioEngine.decodeAudioData(arrayBuffer);

      audioEngine.setPadBuffer(selectedPad.id, audioBuffer);

      onUpdatePad({
        ...selectedPad,
        name: file.name.substring(0, 16),
        buffer: audioBuffer,
        sliceStart: 0,
        sliceEnd: audioBuffer.duration,
      });
    } catch (err) {
      console.error('Failed to decode uploaded audio file:', err);
    }
  };

  const handleParamChange = (key: keyof Pad, value: unknown) => {
    onUpdatePad({
      ...selectedPad,
      [key]: value,
    });
  };

  const currentPitchOffset = selectedPad.pitchOffset ?? 0;

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl font-mono text-zinc-200">
      {/* Workbench Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
        <div>
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Workbench</span>
          <h2 className="text-sm font-bold text-amber-400">
            Pad {(selectedPad.id + 1).toString().padStart(2, '0')} : {selectedPad.name || 'Empty Slot'}
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs px-3 py-1.5 rounded border border-zinc-700 transition-all">
            <span>Load Sample</span>
            <input type="file" accept="audio/*" className="hidden" onChange={handleAudioFileUpload} />
          </label>
          <button
            type="button"
            onClick={() => onTriggerPad(selectedPad.id)}
            disabled={!selectedPad.buffer}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold text-xs px-4 py-1.5 rounded transition-all"
          >
            Test Play
          </button>
        </div>
      </div>

      {/* Waveform Viewport Placeholder */}
      <div className="relative bg-zinc-950 border border-zinc-800 rounded-lg h-36 flex items-center justify-center overflow-hidden mb-4">
        {selectedPad.buffer ? (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="flex items-center space-x-0.5 w-full h-24 justify-between opacity-80">
              {Array.from({ length: 48 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-amber-400/70 rounded-full"
                  style={{
                    height: `${Math.max(15, Math.sin(i * 0.4) * 80 + Math.random() * 20)}%`,
                  }}
                />
              ))}
            </div>
            <div className="absolute bottom-2 left-2 text-[10px] text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
              Duration: {selectedPad.buffer.duration.toFixed(2)}s
            </div>
          </div>
        ) : (
          <span className="text-xs text-zinc-600">No audio buffer loaded. Click 'Load Sample' above.</span>
        )}
      </div>

      {/* Parameter Editing Controls */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        {/* Left Column: Slicing & Playback Options */}
        <div className="space-y-3 bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/80">
          <div className="text-xs font-semibold text-zinc-400 border-b border-zinc-800 pb-1">
            Playback & Slicing
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Slice Start</span>
            <span className="text-amber-400">{selectedPad.sliceStart.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={selectedPad.buffer ? selectedPad.buffer.duration : 1}
            step={0.01}
            value={selectedPad.sliceStart}
            onChange={(e) => handleParamChange('sliceStart', parseFloat(e.target.value))}
            className="w-full accent-amber-500 bg-zinc-800 rounded h-1 cursor-pointer"
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Slice End</span>
            <span className="text-amber-400">
              {selectedPad.sliceEnd.toFixed(2)}s
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={selectedPad.buffer ? selectedPad.buffer.duration : 1}
            step={0.01}
            value={selectedPad.sliceEnd}
            onChange={(e) => handleParamChange('sliceEnd', parseFloat(e.target.value))}
            className="w-full accent-amber-500 bg-zinc-800 rounded h-1 cursor-pointer"
          />

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center space-x-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPad.loop}
                onChange={(e) => handleParamChange('loop', e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-0"
              />
              <span>Loop Playback</span>
            </label>

            <label className="flex items-center space-x-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPad.reverse}
                onChange={(e) => handleParamChange('reverse', e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-0"
              />
              <span>Reverse</span>
            </label>
          </div>
        </div>

        {/* Right Column: Volume, Pan, and Pitch Offset */}
        <div className="space-y-3 bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/80">
          <div className="text-xs font-semibold text-zinc-400 border-b border-zinc-800 pb-1">
            Mix & Pitch
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Volume</span>
            <span className="text-amber-400">{Math.round(selectedPad.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={selectedPad.volume}
            onChange={(e) => handleParamChange('volume', parseFloat(e.target.value))}
            className="w-full accent-amber-500 bg-zinc-800 rounded h-1 cursor-pointer"
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Pitch Offset</span>
            <span className="text-cyan-400">
              {currentPitchOffset > 0 ? `+${currentPitchOffset}` : currentPitchOffset} st
            </span>
          </div>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={currentPitchOffset}
            onChange={(e) => handleParamChange('pitchOffset', parseInt(e.target.value, 10))}
            className="w-full accent-cyan-500 bg-zinc-800 rounded h-1 cursor-pointer"
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Pan</span>
            <span className="text-zinc-300">
              {selectedPad.pan < 0 ? `L${Math.abs(Math.round(selectedPad.pan * 100))}` : selectedPad.pan > 0 ? `R${Math.round(selectedPad.pan * 100)}` : 'Center'}
            </span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={selectedPad.pan}
            onChange={(e) => handleParamChange('pan', parseFloat(e.target.value))}
            className="w-full accent-zinc-500 bg-zinc-800 rounded h-1 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
