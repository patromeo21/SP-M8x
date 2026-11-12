import React, { useState } from 'react';
import { PadBankManager } from '../sampler/PadBankManager';

type DeckMode = 'pads' | 'm8';

interface HardwareDeckProps {
  className?: string;
}

const gridSlots: Array<string | null> = [
  null, 'UP', null, null, null,
  'LEFT', 'DOWN', 'RIGHT', 'OPT', 'EDIT',
  'HOLD', null, null, 'SHIFT', 'PLAY',
];

const punchInSlots: Array<string | null> = [
  null, '1:DJFX', null, null, null,
  '2:TAPE', '3:SWEEP', '4:LO-FI', '5:SUB', '6:ISO',
  'HOLD:ON', null, null, '7:CRUSH', '8:DELAY',
];

/** Fixed-footprint pads / M8 faceplate switcher for the workspace performance deck. */
export const HardwareDeck: React.FC<HardwareDeckProps> = ({ className = '' }) => {
  const [mode, setMode] = useState<DeckMode>('pads');
  const [hold, setHold] = useState(false);
  const keys = hold ? punchInSlots : gridSlots;

  return (
    <section className={`flex min-h-0 flex-col border border-[var(--border-grid)] bg-[var(--bg-canvas)] ${className}`}>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-grid)] px-3 py-2">
        <span className="text-[10px] font-bold tracking-wider text-[var(--accent-phrase)]">PERFORMANCE DECK</span>
        <div className="flex items-center gap-1" role="group" aria-label="Performance deck mode">
          <button type="button" aria-pressed={mode === 'pads'} onClick={() => setMode('pads')}
            className={`min-h-9 px-2 text-[9px] font-bold ${mode === 'pads' ? 'bg-[var(--accent-phrase)] text-[var(--bg-canvas)]' : 'text-zinc-400'}`}>
            [ 4x4 PADS ]
          </button>
          <span className="text-[var(--text-inactive)]" aria-hidden="true">&lt;--&gt;</span>
          <button type="button" aria-pressed={mode === 'm8'} onClick={() => setMode('m8')}
            className={`min-h-9 px-2 text-[9px] font-bold ${mode === 'm8' ? 'bg-[var(--accent-phrase)] text-[var(--bg-canvas)]' : 'text-zinc-400'}`}>
            [ M8 DECK ]
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 p-2">
        {mode === 'pads' ? (
          <div className="h-full overflow-auto">
            <PadBankManager />
          </div>
        ) : (
          <div className="grid h-full grid-cols-5 grid-rows-3 gap-2" role="group" aria-label="M8 hardware deck">
            {keys.map((label, index) => {
              if (!label) return <div key={`blank-${index}`} aria-hidden="true" className="bg-[var(--bg-canvas)]" />;
              const isHold = index === 10;
              const accent = hold && !isHold ? 'border-[var(--accent-table)] text-[var(--accent-table)]' :
                isHold && hold ? 'border-[var(--accent-song)] bg-[var(--accent-song)] text-[var(--bg-canvas)]' :
                'border-[var(--border-grid)] text-[var(--text-primary)]';

              return (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  aria-pressed={isHold ? hold : undefined}
                  onPointerDown={isHold ? () => setHold((value) => !value) : undefined}
                  className={`touch-target flex min-h-0 items-center justify-center border text-center text-[clamp(8px,1vw,12px)] font-bold leading-tight active:bg-[var(--accent-phrase)] active:text-[var(--bg-canvas)] ${accent}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default HardwareDeck;
