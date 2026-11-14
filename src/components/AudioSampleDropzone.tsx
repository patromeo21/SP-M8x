/**
 * SP-M8x Hybrid Music Production Suite
 * AudioSampleDropzone.tsx — Touch-Optimized Audio File Importer Component
 */

import React, { useState } from 'react';
import { audioEngine } from '../audio/audioEngine';

interface AudioSampleDropzoneProps {
  padId: string;
  onSampleLoaded: (padId: string, buffer: AudioBuffer, fileName: string, audio: Blob) => void;
  disabled?: boolean;
}

export const AudioSampleDropzone: React.FC<AudioSampleDropzoneProps> = ({ padId, onSampleLoaded, disabled }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const targetPadId = padId;
    e.target.value = '';
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioEngine.decodeAudioData(arrayBuffer);
      console.log(`[AudioSampleDropzone] Successfully decoded audio file: ${file.name} (${audioBuffer.duration.toFixed(2)}s)`);
      
      onSampleLoaded(targetPadId, audioBuffer, file.name, file);
    } catch (err) {
      console.error(`[AudioSampleDropzone] Failed to decode audio file "${file.name}":`, err);
      setErrorMessage('Could not load sample. Check the file and audio permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="sample-dropzone flex flex-1 min-w-0 flex-col items-center justify-center p-3 bg-zinc-950 border border-zinc-800 rounded-xl gap-2 font-mono select-none">
      <label className={`sample-file-label relative w-full py-2 px-3 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-bold text-zinc-300 flex items-center justify-center gap-2 ${disabled || isLoading ? 'opacity-40' : ''}`}>
        <input
          type="file"
          accept="audio/*,.wav,.mp3,.flac,.aiff,.aif,.m4a"
          disabled={disabled || isLoading}
          aria-label={`Load sample for ${padId}`}
          className="sample-file-input"
          onClick={() => {
          void audioEngine.initialize().catch((error: unknown) => {
            console.error('[AudioSampleDropzone] Could not start audio:', error);
            setErrorMessage('Could not start audio. Check audio permissions.');
          });
          }}
          onChange={handleFileChange}
        />
        <span>📁</span>
        <span className="truncate">{`LOAD SAMPLE (${padId})`}</span>
      </label>
      {isLoading && (
        <span className="text-[10px] text-cyan-400 animate-pulse">DECODING AUDIO BUFFER...</span>
      )}
      {errorMessage && <span role="alert" className="text-[10px] text-red-400">{errorMessage}</span>}
    </div>
  );
};