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
  const [isLoading, setIsLoading] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const audioBuffer = await audioEngine.decodeAudioData(await file.arrayBuffer());
      audioEngine.setPadBuffer(padId, audioBuffer);
      setLoadedFileName(file.name);
      onSampleLoaded(padId, audioBuffer, file.name);
    } catch (error) {
      console.error(`[AudioSampleDropzone] Failed to decode audio file "${file.name}":`, error);
    } finally {
      setIsLoading(false);
      // Allow selecting the same file again to replace the current sample.
      e.target.value = '';
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
        onPointerDown={() => fileInputRef.current?.click()}
        className="w-full py-2 px-3 bg-zinc-900 border border-zinc-700 hover:border-cyan-500 rounded-lg text-xs font-bold text-zinc-300 transition-all flex items-center justify-center gap-2 active:scale-95"
      >
        <span>📁</span>
        <span className="truncate">{loadedFileName ? `LOADED: ${loadedFileName}` : `LOAD SAMPLE (${padId})`}</span>
      </button>
      {isLoading && <span className="text-[10px] text-cyan-400 animate-pulse">DECODING AUDIO BUFFER...</span>}
    </div>
  );
};
