import React, { useState, useRef, useEffect, useCallback } from 'react';
import { projectController } from '../project/projectController';

export interface SongArrangementProps {
  /** Number of tracks (defaults to 8) */
  trackCount?: number;
  /** Number of vertical song rows (defaults to 32 / 00–1F) */
  rowCount?: number;
  /** Active transport playback state */
  isPlaying: boolean;
  /** Current 16-step phrase position (0–15) from trackerEngine */
  currentStep: number;
  /** Callback fired when a song row triggers new phrase IDs per track */
  onRowTrigger?: (rowIndex: number, trackPhrases: (number | null)[]) => void;
  /** Optional jump directly into Phrase editor when double-tapping an assigned cell */
  onOpenPhrase?: (trackIndex: number, phraseId: number) => void;
}

const toHex = (val: number): string =>
  val.toString(16).toUpperCase().padStart(2, '0');

function resolvePrimaryPatternIndex(
  rowCells: readonly (number | null)[],
  selectedTrack: number,
  patternCount: number,
): number | null {
  if (patternCount <= 0) return null;
  const selectedTrackVal = rowCells[selectedTrack];
  if (
    typeof selectedTrackVal === 'number' &&
    Number.isInteger(selectedTrackVal) &&
    selectedTrackVal >= 0 &&
    selectedTrackVal < patternCount
  ) {
    return selectedTrackVal;
  }
  for (const cell of rowCells) {
    if (
      typeof cell === 'number' &&
      Number.isInteger(cell) &&
      cell >= 0 &&
      cell < patternCount
    ) {
      return cell;
    }
  }
  return null;
}

export const SongArrangementView: React.FC<SongArrangementProps> = ({
  trackCount = 8,
  rowCount = 32,
  isPlaying,
  currentStep,
  onRowTrigger,
  onOpenPhrase,
}) => {
  const [projectRevision, setProjectRevision] = useState(0);

  useEffect(() => {
    return projectController.subscribe(() => {
      setProjectRevision((prev) => prev + 1);
    });
  }, []);

  const projectState = projectController.getState();
  const patterns = projectState.tracker.patterns;
  const activePatternIndex = projectState.settings.activePatternIndex;
  const selectedTrackIndex = projectController.getSelectedTrackIndex();

  // 2D matrix: [rowIndex][trackIndex] => phraseId (0..254) | null ('--')
  const [grid, setGrid] = useState<(number | null)[][]>(() => {
    const initial = Array.from({ length: rowCount }, () =>
      Array.from({ length: trackCount }, () => null as number | null),
    );
    // Seed Row 00 with Phrase 00 on Tracks 1–4 for immediate playback readiness
    initial[0][0] = 0;
    if (trackCount > 1) initial[0][1] = 1;
    if (trackCount > 2) initial[0][2] = 2;
    if (trackCount > 3) initial[0][3] = 3;
    return initial;
  });

  const [songModeActive, setSongModeActive] = useState<boolean>(true);
  const [activeRow, setActiveRow] = useState<number>(() =>
    Math.max(0, Math.min(rowCount - 1, activePatternIndex)),
  );
  const [queuedRow, setQueuedRow] = useState<number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ row: number; track: number }>(() => ({
    row: 0,
    track: Math.max(0, Math.min(trackCount - 1, selectedTrackIndex)),
  }));

  // Pointer press-and-slide scrubbing state
  const scrubRef = useRef<{
    active: boolean;
    row: number;
    track: number;
    startY: number;
    startVal: number;
    moved: boolean;
  } | null>(null);

  const lastBarStepRef = useRef<number>(-1);

  useEffect(() => {
    const clampedTrack = Math.max(0, Math.min(trackCount - 1, selectedTrackIndex));
    setSelectedCell((prev) => (prev.track === clampedTrack ? prev : { ...prev, track: clampedTrack }));
  }, [selectedTrackIndex, trackCount, projectRevision]);

  useEffect(() => {
    if (isPlaying && songModeActive) return;
    if (queuedRow !== null) return;
    if (
      activePatternIndex >= 0 &&
      activePatternIndex < rowCount &&
      grid[activePatternIndex]?.some((cell) => cell !== null)
    ) {
      setActiveRow(activePatternIndex);
    }
  }, [activePatternIndex, grid, isPlaying, queuedRow, rowCount, songModeActive]);

  const applyRowToProject = useCallback(
    (rowIdx: number, rowCells: (number | null)[]) => {
      const targetPatternIndex = resolvePrimaryPatternIndex(
        rowCells,
        selectedCell.track,
        patterns.length,
      );
      if (targetPatternIndex !== null && targetPatternIndex !== projectController.getState().settings.activePatternIndex) {
        projectController.setActivePattern(targetPatternIndex);
      }
      onRowTrigger?.(rowIdx, rowCells);
    },
    [onRowTrigger, patterns.length, selectedCell.track],
  );

  // Find next playable row (loops back to 00 when hitting an empty row)
  const resolveNextRow = useCallback(
    (current: number, matrix: (number | null)[][]): number => {
      const next = current + 1;
      if (next < matrix.length && matrix[next].some((cell) => cell !== null)) {
        return next;
      }
      return 0;
    },
    [],
  );

  // Bar-boundary advancement & queued row execution
  useEffect(() => {
    if (!isPlaying || !songModeActive) {
      lastBarStepRef.current = -1;
      return;
    }

    // Trigger on step 0 bar downbeat (once per bar)
    if (currentStep === 0 && lastBarStepRef.current !== 0) {
      lastBarStepRef.current = 0;

      if (queuedRow !== null) {
        const targetRow = queuedRow;
        setActiveRow(targetRow);
        setQueuedRow(null);
        applyRowToProject(targetRow, grid[targetRow]);
      } else {
        setActiveRow((prev) => {
          const next = resolveNextRow(prev, grid);
          applyRowToProject(next, grid[next]);
          return next;
        });
      }
    } else if (currentStep !== 0) {
      lastBarStepRef.current = currentStep;
    }
  }, [isPlaying, songModeActive, currentStep, queuedRow, grid, resolveNextRow, applyRowToProject]);

  const maxPhraseId = Math.max(0, patterns.length - 1, 254);

  const updateCell = (row: number, track: number, value: number | null) => {
    setGrid((prev) => {
      const copy = prev.map((r) => [...r]);
      copy[row][track] = value;
      return copy;
    });
    if (typeof value === 'number' && value >= 0 && value < patterns.length) {
      projectController.setActivePattern(value);
    }
  };

  // Pointer handlers for tap-to-assign & vertical press-and-slide hex scrubbing
  const handleCellPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    row: number,
    track: number,
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedCell({ row, track });
    if (track < 8) {
      projectController.setSelectedTrackIndex(track);
    }

    const currentVal = grid[row][track];
    scrubRef.current = {
      active: true,
      row,
      track,
      startY: e.clientY,
      startVal: currentVal ?? 0,
      moved: false,
    };
  };

  const handleCellPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const scrub = scrubRef.current;
    if (!scrub || !scrub.active) return;

    const deltaY = scrub.startY - e.clientY; // Drag up = increment, drag down = decrement
    if (Math.abs(deltaY) > 8) {
      scrub.moved = true;
      const stepDelta = Math.trunc(deltaY / 10);
      const nextVal = Math.max(0, Math.min(maxPhraseId, scrub.startVal + stepDelta));
      updateCell(scrub.row, scrub.track, nextVal);
    }
  };

  const handleCellPointerUp = (
    e: React.PointerEvent<HTMLButtonElement>,
    row: number,
    track: number,
  ) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const scrub = scrubRef.current;
    scrubRef.current = null;

    if (scrub && !scrub.moved) {
      // Clean tap behavior: toggle '--' <-> '00' (or clone previous row's phrase ID)
      const currentVal = grid[row][track];
      if (currentVal === null) {
        const inherited =
          row > 0 && grid[row - 1][track] !== null ? grid[row - 1][track]! : 0;
        updateCell(row, track, inherited);
      } else {
        updateCell(row, track, null);
      }
    }
  };

  const handleRowCue = (rowIndex: number) => {
    if (!isPlaying) {
      setActiveRow(rowIndex);
      setQueuedRow(null);
      applyRowToProject(rowIndex, grid[rowIndex]);
    } else {
      setQueuedRow(rowIndex);
    }
  };

  const cloneRowDown = () => {
    const { row } = selectedCell;
    if (row + 1 >= rowCount) return;
    setGrid((prev) => {
      const copy = prev.map((r) => [...r]);
      copy[row + 1] = [...copy[row]];
      return copy;
    });
    setSelectedCell((prev) => ({ ...prev, row: row + 1 }));
  };

  const clearSelectedRow = () => {
    const { row } = selectedCell;
    setGrid((prev) => {
      const copy = prev.map((r) => [...r]);
      copy[row] = Array.from({ length: trackCount }, () => null);
      return copy;
    });
  };

  const currentPhrase = grid[selectedCell.row]?.[selectedCell.track] ?? null;

  return (
    <section className="song-arrangement-shell" aria-label="M8 Song Arrangement">
      {/* Top Hardware Utility Bar */}
      <header className="song-toolbar">
        <div className="song-toolbar-left">
          <span className="song-badge">SONG</span>
          <button
            type="button"
            className={`song-mode-toggle ${songModeActive ? 'is-armed' : ''}`}
            onClick={() => setSongModeActive((v) => !v)}
          >
            {songModeActive ? 'CHAIN: AUTO' : 'CHAIN: HOLD'}
          </button>
          <span className="song-readout">
            ROW <strong>{toHex(activeRow)}</strong>
            {queuedRow !== null && (
              <span className="song-cue-pill"> → {toHex(queuedRow)}</span>
            )}
            <span className="song-phrase-readout">
              {' '}· PHR {toHex(activePatternIndex)} ({patterns.length})
            </span>
          </span>
        </div>

        <div className="song-toolbar-actions">
          <button
            type="button"
            className="song-util-btn"
            onClick={() => projectController.createPattern()}
            title="Create new phrase pattern"
          >
            + PHR
          </button>
          <button
            type="button"
            className="song-util-btn"
            onClick={cloneRowDown}
            title="Duplicate selected row downward"
          >
            CLONE ↓
          </button>
          <button
            type="button"
            className="song-util-btn"
            onClick={clearSelectedRow}
            title="Clear selected row"
          >
            CLR ROW
          </button>
          {currentPhrase !== null && onOpenPhrase && (
            <button
              type="button"
              className="song-util-btn is-accent"
              onClick={() => {
                if (currentPhrase >= 0 && currentPhrase < patterns.length) {
                  projectController.setActivePattern(currentPhrase);
                }
                onOpenPhrase(selectedCell.track, currentPhrase);
              }}
            >
              EDIT {toHex(currentPhrase)} →
            </button>
          )}
        </div>
      </header>

      {/* Sticky Track Column Header */}
      <div
        className="song-grid-header"
        style={{
          gridTemplateColumns: `52px repeat(${trackCount}, minmax(44px, 1fr))`,
        }}
      >
        <div className="song-col-head is-row-head">ROW</div>
        {Array.from({ length: trackCount }, (_, t) => (
          <div
            key={t}
            className={`song-col-head ${selectedCell.track === t ? 'is-selected-col' : ''}`}
          >
            T{t + 1}
          </div>
        ))}
      </div>

      {/* Scrollable Vertical M8 Song Rows (00–1F) */}
      <div className="song-grid-scroll" role="grid">
        {grid.map((rowCells, rIdx) => {
          const isCurrent = rIdx === activeRow;
          const isQueued = rIdx === queuedRow;
          const hasData = rowCells.some((c) => c !== null);

          return (
            <div
              key={rIdx}
              role="row"
              className={`song-row ${isCurrent ? 'is-playing-row' : ''} ${
                isQueued ? 'is-queued-row' : ''
              } ${hasData ? 'has-phrases' : ''}`}
              style={{
                gridTemplateColumns: `52px repeat(${trackCount}, minmax(44px, 1fr))`,
              }}
            >
              {/* Tappable Row Address Cell for Bar-Quantized Cueing */}
              <button
                type="button"
                className="song-row-addr"
                onClick={() => handleRowCue(rIdx)}
                title={`Cue Row ${toHex(rIdx)}`}
              >
                <span className="song-play-dot" />
                {toHex(rIdx)}
              </button>

              {/* Track Phrase Slot Cells */}
              {rowCells.map((phraseId, tIdx) => {
                const isSelected =
                  selectedCell.row === rIdx && selectedCell.track === tIdx;

                return (
                  <button
                    key={tIdx}
                    type="button"
                    role="gridcell"
                    className={`song-cell ${phraseId !== null ? 'is-assigned' : 'is-empty'} ${
                      isSelected ? 'is-selected' : ''
                    }`}
                    onPointerDown={(e) => handleCellPointerDown(e, rIdx, tIdx)}
                    onPointerMove={handleCellPointerMove}
                    onPointerUp={(e) => handleCellPointerUp(e, rIdx, tIdx)}
                  >
                    {phraseId !== null ? toHex(phraseId) : '--'}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default SongArrangementView;