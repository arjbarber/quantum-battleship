import { useState } from 'react';
import './Grid.css';

// ── Types ────────────────────────────────────────────────────────────────

export type CellState =
  | 'empty'
  | 'ship'
  | 'hit'
  | 'miss'
  | 'sunk'
  | 'superposition-a'  // purple shimmer
  | 'superposition-b'  // cyan shimmer
  | 'quantum-ghost';

export interface CellData {
  x: number;
  y: number;
  state: CellState;
}

interface GridProps {
  cells: CellData[][];
  onCellClick?: (x: number, y: number) => void;
  onCellHover?: (x: number, y: number) => void;
  onCellLeave?: () => void;
  isOpponent?: boolean;
  disabled?: boolean;
  previewCells?: { x: number; y: number; type: 'valid' | 'invalid' | 'super-a' | 'super-b' }[];
  label?: string;
}

// Row labels: A-J
const ROW_LABELS = 'ABCDEFGHIJ'.split('');
// Column labels: 1-10
const COL_LABELS = Array.from({ length: 10 }, (_, i) => `${i + 1}`);

// ── Cell Renderer ────────────────────────────────────────────────────────

function CellContent({ state }: { state: CellState }) {
  switch (state) {
    case 'ship':
      return <div className="cell-ship-segment" />;
    case 'hit':
      return <span className="cell-hit-marker">💥</span>;
    case 'miss':
      return <div className="cell-miss-marker" />;
    case 'sunk':
      return <span className="cell-sunk-marker">☠️</span>;
    case 'quantum-ghost':
      return <span className="cell-ghost-marker">👻</span>;
    case 'superposition-a':
    case 'superposition-b':
      return <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>⟨ψ⟩</span>;
    default:
      return null;
  }
}

function getCellClass(state: CellState): string {
  switch (state) {
    case 'ship': return 'cell-ship';
    case 'hit': return 'cell-hit';
    case 'miss': return 'cell-miss';
    case 'sunk': return 'cell-sunk';
    case 'superposition-a': return 'cell-superposition-a';
    case 'superposition-b': return 'cell-superposition-b';
    case 'quantum-ghost': return 'cell-quantum-ghost';
    default: return 'cell-empty';
  }
}

// ── Grid Component ───────────────────────────────────────────────────────

export default function Grid({
  cells,
  onCellClick,
  onCellHover,
  onCellLeave,
  isOpponent = false,
  disabled = false,
  previewCells = [],
  label,
}: GridProps) {
  // Build preview map for O(1) lookup
  const previewMap = new Map<string, string>();
  for (const pc of previewCells) {
    previewMap.set(`${pc.x},${pc.y}`, pc.type);
  }

  const handleMouseEnter = (x: number, y: number) => {
    onCellHover?.(x, y);
  };

  const handleMouseLeave = () => {
    onCellLeave?.();
  };

  const handleClick = (x: number, y: number) => {
    if (disabled) return;
    onCellClick?.(x, y);
  };

  return (
    <div className="board-container">
      {label && (
        <div className={`board-label ${isOpponent ? 'board-label-opponent' : 'board-label-own'}`}>
          {label}
        </div>
      )}
      <div className="grid-wrapper">
        {/* Column labels */}
        <div className="grid-col-labels">
          {COL_LABELS.map((col) => (
            <div key={col} className="grid-col-label">{col}</div>
          ))}
        </div>

        {/* Grid rows */}
        {cells.map((row, y) => (
          <div key={y} className="grid-row">
            {/* Row label */}
            <div className="grid-row-label">{ROW_LABELS[y]}</div>

            {/* Cells */}
            {row.map((cell) => {
              const key = `${cell.x},${cell.y}`;
              const previewType = previewMap.get(key);
              const isInteractive = isOpponent && !disabled && cell.state === 'empty';

              let cellClass = `grid-cell ${getCellClass(cell.state)}`;
              if (isInteractive) cellClass += ' grid-cell-interactive';
              if (previewType === 'valid') cellClass += ' cell-preview-valid';
              if (previewType === 'invalid') cellClass += ' cell-preview-invalid';
              if (previewType === 'super-a') cellClass += ' cell-preview-super-a';
              if (previewType === 'super-b') cellClass += ' cell-preview-super-b';

              return (
                <div
                  key={key}
                  className={cellClass}
                  onClick={() => handleClick(cell.x, cell.y)}
                  onMouseEnter={() => handleMouseEnter(cell.x, cell.y)}
                  onMouseLeave={handleMouseLeave}
                  data-x={cell.x}
                  data-y={cell.y}
                  id={`cell-${isOpponent ? 'opp' : 'own'}-${cell.x}-${cell.y}`}
                >
                  <CellContent state={cell.state} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Create an empty 10×10 grid */
export function createEmptyGrid(): CellData[][] {
  return Array.from({ length: 10 }, (_, y) =>
    Array.from({ length: 10 }, (_, x) => ({
      x,
      y,
      state: 'empty' as CellState,
    }))
  );
}
