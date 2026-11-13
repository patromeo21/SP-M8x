/**
 * SP-M8x Sampler Workspace
 * SamplerWorkspace.tsx — Main container combining PadGrid and SamplerWorkbench
 */

import React, { useState } from 'react';
import { Pad, SamplerMode, BankId } from '../types';
import { PadGrid } from './PadGrid';
import { SamplerWorkbench } from './SamplerWorkbench';
import { audioEngine } from '../audio/audioEngine';

interface SamplerWorkspaceProps {
  pads: Pad[];
  mode: SamplerMode;
  activeBank: BankId;
  onUpdatePad: (updatedPad: Pad) => void;
}

export const SamplerWorkspace: React.FC<SamplerWorkspaceProps> = ({
  pads,
  mode,
  activeBank,
  onUpdatePad,
}) => {
  const [selectedPadId, setSelectedPadId] = useState<number>(0);

  const selectedPad = pads.find((p) => p.id === selectedPadId) || pads[0];

  const handleTestPlay = async (padId: number) => {
    try {
      await audioEngine.initialize();
      const pad = pads.find((p) => p.id === padId);
      if (!pad || !pad.buffer) return;

      audioEngine.setPadBuffer(padId, pad.buffer);
      audioEngine.triggerPad(padId, {
        sliceStart: pad.sliceStart,
        sliceEnd: pad.sliceEnd,
        volume: pad.volume,
        semitoneOffset: pad.pitchOffset || 0,
        loop: pad.loop,
      });
    } catch (error) {
      console.error('[SamplerWorkspace] Could not start audio:', error);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full p-4 overflow-y-auto">
      {/* Left Column: 16-Pad Performance Grid */}
      <div className="lg:col-span-6 h-full min-h-[400px]">
        <PadGrid
          pads={pads}
          mode={mode}
          activeBank={activeBank}
          onPadSelect={setSelectedPadId}
          selectedPadId={selectedPadId}
        />
      </div>

      {/* Right Column: Sample Editing Workbench */}
      <div className="lg:col-span-6 h-full min-h-[400px]">
        <SamplerWorkbench
          selectedPad={selectedPad}
          onUpdatePad={onUpdatePad}
          onTriggerPad={handleTestPlay}
        />
      </div>
    </div>
  );
};
