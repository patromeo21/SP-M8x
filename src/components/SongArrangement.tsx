/**
 * SP-M8x — SONG arrangement matrix (8 tracks × 32 rows)
 */
import React from 'react';
import { projectController } from '../project/projectController';

interface SongArrangementProps { revision: number; }

export const SongArrangement: React.FC<SongArrangementProps> = ({ revision }) => {
  const { song } = projectController.getState();
  return (
    <section className="flex min-h-0 flex-1 flex-col border border-[var(--border-grid)] bg-[var(--bg-canvas)] p-2" data-revision={revision}>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-grid)] px-2 py-2">
        <div>
          <h2 className="text-[10px] font-bold tracking-widest text-[var(--accent-song)]">SONG ARRANGEMENT</h2>
          <p className="mt-1 text-[9px] text-zinc-500">8 tracks · 32 rows · tap a cell to cycle P01–P99</p>
        </div>
        <span className="text-[9px] text-zinc-500">EMPTY CELL → P01 → … → P99 → EMPTY</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-center font-mono text-[10px]">
          <thead className="sticky top-0 z-10 bg-zinc-900 text-[9px] text-zinc-400">
            <tr>
              <th className="sticky left-0 z-20 bg-zinc-900 px-2 py-2">ROW</th>
              {song.tracks.map((track) => <th key={track.id} className="min-w-20 px-2 py-2">{track.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 32 }, (_, rowIndex) => (
              <tr key={rowIndex} className="border-t border-zinc-800">
                <th scope="row" className="sticky left-0 bg-zinc-950 px-2 py-1.5 text-zinc-500">{rowIndex.toString(16).toUpperCase().padStart(2, '0')}</th>
                {song.tracks.map((track, trackIndex) => {
                  const patternId = track.rows[rowIndex];
                  return (
                    <td key={track.id} className="p-1">
                      <button type="button" aria-label={`${track.name}, row ${rowIndex}, ${patternId ? `pattern ${patternId}` : 'empty'}`}
                        onClick={() => projectController.setSongCell(trackIndex, rowIndex, patternId === null ? 1 : patternId === 99 ? null : patternId + 1)}
                        className={`min-h-9 w-full rounded border px-2 font-bold ${patternId === null ? 'border-zinc-800 bg-zinc-950 text-zinc-600' : 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'}`}>
                        {patternId === null ? '---' : `P${String(patternId).padStart(2, '0')}`}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default SongArrangement;
