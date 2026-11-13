/**
 * SP-M8x Hybrid Music Production Suite
 * AudioSampleDropzone.tsx — Touch-Optimized Audio File Importer Component
 */

import React, { useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';

interface AudioSampleDropzoneProps {
  padId: string;
  onSampleLoaded: (padId: string, buffer: AudioBuffer, fileName: string) => void;
}

export const AudioSampleDropzone: React.FC<AudioSampleDropzoneProps> = ({ padId, onSampleLoaded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioEngine.decodeAudioData(arrayBuffer);
      console.log(`[AudioSampleDropzone] Successfully decoded audio file: ${file.name} (${audioBuffer.duration.toFixed(2)}s)`);
      
      setLoadedFileName(file.name);
      onSampleLoaded(padId, audioBuffer, file.name);
    } catch (err) {
      console.error(`[AudioSampleDropzone] Failed to decode audio file "${file.name}":`, err);
      setErrorMessage('Could not load sample. Check the file and audio permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 bg-zinc-950 border border-zinc-800 rounded-xl gap-2 font-mono select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.aiff,.m4a"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onPointerDown={() => {
          void audioEngine.initialize().catch((error: unknown) => {
            console.error('[AudioSampleDropzone] Could not start audio:', error);
            setErrorMessage('Could not start audio. Check audio permissions.');
          });
          fileInputRef.current?.click();
        }}
        className="w-full py-2 px-3 bg-zinc-900 border border-zinc-700 hover:border-cyan-500 rounded-lg text-xs font-bold text-zinc-300 transition-all flex items-center justify-center gap-2 active:scale-95"
      >
        <span>📁</span>
        <span className="truncate">{loadedFileName ? `LOADED: ${loadedFileName}` : `LOAD SAMPLE (${padId})`}</span>
      </button>
      {isLoading && (
        <span className="text-[10px] text-cyan-400 animate-pulse">DECODING AUDIO BUFFER...</span>
      )}
      {errorMessage && <span role="alert" className="text-[10px] text-red-400">{errorMessage}</span>}
    </div>
  );
};