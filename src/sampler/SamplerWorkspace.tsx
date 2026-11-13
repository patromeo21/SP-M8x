/**
 * SP-M8x Hybrid Music Production Suite
 * SamplerWorkspace.tsx — Full-width sampler view: pad bank beside the sample workbench
 */

import React from 'react';
import { BANKS, type PadBankApi } from './usePadBank';
import { PadBankManager } from './PadBankManager';
import { SamplerWorkbench } from './SamplerWorkbench';

export interface SamplerWorkspaceProps {
  padBank: PadBankApi;
}

export const SamplerWorkspace: React.FC<SamplerWorkspaceProps> = ({ padBank }) => (
  <div className="flex-1 grid grid-cols-2 gap-3 overflow-y-auto">
    <div className="bg-[var(--bg-canvas)] border border-[var(--border-grid)] rounded-xl p-3 shadow-xl flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-[var(--border-grid)] pb-2">
        <span className="text-[10px] font-bold text-[var(--accent-phrase)] tracking-wider">PAD BANKS</span>
        <div className="flex space-x-1">
          {BANKS.map((bank) => (
            <button
              key={bank}
              type="button"
              onClick={() => padBank.setActiveBank(bank)}
              className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                padBank.activeBank === bank ? 'bg-cyan-900 text-cyan-200' : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              {bank}
            </button>
          ))}
        </div>
      </div>
      <PadBankManager
        slots={padBank.slots}
        activeBank={padBank.activeBank}
        selectedPadId={padBank.selectedPadId}
        triggerPad={padBank.triggerPad}
      />
    </div>
    <SamplerWorkbench
      pad={padBank.selectedPad}
      onUpdatePad={padBank.updatePad}
      onLoadSample={padBank.loadSample}
      onAudition={padBank.triggerPad}
    />
  </div>
);

export default SamplerWorkspace;
