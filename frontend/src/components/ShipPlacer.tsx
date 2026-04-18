import { useState, useCallback, useMemo } from 'react';
import Grid, { createEmptyGrid } from './Grid';
import './ShipPlacer.css';

// ── Types ────────────────────────────────────────────────────────────────

interface ShipDef {
  name: string;
  size: number;
}

interface PlacedShip {
  name: string;
  size: number;
  placement_type: 'classical' | 'superposition';
  x_a: number;
  y_a: number;
  orientation_a: 'horizontal' | 'vertical';
  x_b?: number;
  y_b?: number;
  orientation_b?: 'horizontal' | 'vertical';
}

interface ShipPlacerProps {
  onPlaceShips: (ships: PlacedShip[]) => void;
  disabled?: boolean;
}

const SHIPS: ShipDef[] = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

const GRID_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────────────────

function computePositions(x: number, y: number, size: number, orientation: 'horizontal' | 'vertical') {
  const positions: [number, number][] = [];
  for (let i = 0; i < size; i++) {
    if (orientation === 'horizontal') {
      positions.push([x + i, y]);
    } else {
      positions.push([x, y + i]);
    }
  }
  return positions;
}

function isInBounds(positions: [number, number][]) {
  return positions.every(([x, y]) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE);
}

function positionsOverlap(a: [number, number][], b: [number, number][]) {
  const setA = new Set(a.map(([x, y]) => `${x},${y}`));
  return b.some(([x, y]) => setA.has(`${x},${y}`));
}

// ── Component ────────────────────────────────────────────────────────────

export default function ShipPlacer({ onPlaceShips, disabled = false }: ShipPlacerProps) {
  const [selectedShip, setSelectedShip] = useState<number | null>(null);
  const [placementMode, setPlacementMode] = useState<'classical' | 'superposition'>('classical');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // For superposition: track if placing A or B
  const [superPhase, setSuperPhase] = useState<'a' | 'b'>('a');
  const [superPosA, setSuperPosA] = useState<{ x: number; y: number; orientation: 'horizontal' | 'vertical' } | null>(null);

  // Get all occupied positions from placed ships
  const occupiedPositions = useMemo(() => {
    const positions: Set<string> = new Set();
    for (const ship of placedShips) {
      const posA = computePositions(ship.x_a, ship.y_a, ship.size, ship.orientation_a);
      posA.forEach(([x, y]) => positions.add(`${x},${y}`));
      if (ship.placement_type === 'superposition' && ship.x_b !== undefined && ship.y_b !== undefined) {
        const posB = computePositions(ship.x_b, ship.y_b, ship.size, ship.orientation_b!);
        posB.forEach(([x, y]) => positions.add(`${x},${y}`));
      }
    }
    return positions;
  }, [placedShips]);

  // Build grid with placed ships
  const gridCells = useMemo(() => {
    const grid = createEmptyGrid();

    for (const ship of placedShips) {
      const posA = computePositions(ship.x_a, ship.y_a, ship.size, ship.orientation_a);
      for (const [x, y] of posA) {
        grid[y][x].state = ship.placement_type === 'superposition' ? 'superposition-a' : 'ship';
      }
      if (ship.placement_type === 'superposition' && ship.x_b !== undefined && ship.y_b !== undefined) {
        const posB = computePositions(ship.x_b, ship.y_b, ship.size, ship.orientation_b!);
        for (const [x, y] of posB) {
          grid[y][x].state = 'superposition-b';
        }
      }
    }

    // Show Position A for superposition in-progress
    if (superPhase === 'b' && superPosA && selectedShip !== null) {
      const size = SHIPS[selectedShip].size;
      const posA = computePositions(superPosA.x, superPosA.y, size, superPosA.orientation);
      for (const [x, y] of posA) {
        grid[y][x].state = 'superposition-a';
      }
    }

    return grid;
  }, [placedShips, superPhase, superPosA, selectedShip]);

  // Compute preview cells for hover
  const previewCells = useMemo(() => {
    if (selectedShip === null || !hoverPos || disabled) return [];

    const ship = SHIPS[selectedShip];
    const positions = computePositions(hoverPos.x, hoverPos.y, ship.size, orientation);

    if (!isInBounds(positions)) {
      return positions
        .filter(([x, y]) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE)
        .map(([x, y]) => ({ x, y, type: 'invalid' as const }));
    }

    // Check overlap with existing placed ships
    const placedPositionsList: [number, number][][] = [];
    for (const ps of placedShips) {
      placedPositionsList.push(computePositions(ps.x_a, ps.y_a, ps.size, ps.orientation_a));
      if (ps.placement_type === 'superposition' && ps.x_b !== undefined && ps.y_b !== undefined) {
        placedPositionsList.push(computePositions(ps.x_b, ps.y_b, ps.size, ps.orientation_b!));
      }
    }

    const hasOverlap = placedPositionsList.some((pp) => positionsOverlap(positions, pp));

    if (placementMode === 'superposition') {
      const previewType = hasOverlap ? 'invalid' :
        (superPhase === 'a' ? 'super-a' : 'super-b');
      return positions.map(([x, y]) => ({ x, y, type: previewType as any }));
    }

    return positions.map(([x, y]) => ({
      x,
      y,
      type: hasOverlap ? 'invalid' as const : 'valid' as const,
    }));
  }, [selectedShip, hoverPos, orientation, placedShips, placementMode, superPhase, disabled]);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (selectedShip === null || disabled) return;

    const ship = SHIPS[selectedShip];
    const positions = computePositions(x, y, ship.size, orientation);

    if (!isInBounds(positions)) return;

    // Check overlaps
    for (const ps of placedShips) {
      const posA = computePositions(ps.x_a, ps.y_a, ps.size, ps.orientation_a);
      if (positionsOverlap(positions, posA)) return;
      if (ps.placement_type === 'superposition' && ps.x_b !== undefined && ps.y_b !== undefined) {
        const posB = computePositions(ps.x_b, ps.y_b, ps.size, ps.orientation_b!);
        if (positionsOverlap(positions, posB)) return;
      }
    }

    // Also check against superPosA if in phase B
    if (superPhase === 'b' && superPosA) {
      const posA = computePositions(superPosA.x, superPosA.y, ship.size, superPosA.orientation);
      if (positionsOverlap(positions, posA)) return;
    }

    if (placementMode === 'classical') {
      const newShip: PlacedShip = {
        name: ship.name,
        size: ship.size,
        placement_type: 'classical',
        x_a: x,
        y_a: y,
        orientation_a: orientation,
      };
      setPlacedShips([...placedShips, newShip]);
      setSelectedShip(null);
    } else {
      // Superposition mode
      if (superPhase === 'a') {
        setSuperPosA({ x, y, orientation });
        setSuperPhase('b');
      } else {
        // Phase B — finalize both positions
        const newShip: PlacedShip = {
          name: ship.name,
          size: ship.size,
          placement_type: 'superposition',
          x_a: superPosA!.x,
          y_a: superPosA!.y,
          orientation_a: superPosA!.orientation,
          x_b: x,
          y_b: y,
          orientation_b: orientation,
        };
        setPlacedShips([...placedShips, newShip]);
        setSelectedShip(null);
        setSuperPhase('a');
        setSuperPosA(null);
      }
    }
  }, [selectedShip, orientation, placedShips, placementMode, superPhase, superPosA, disabled]);

  const handleSelectShip = (index: number) => {
    if (disabled) return;
    const shipName = SHIPS[index].name;
    if (placedShips.some((ps) => ps.name === shipName)) return;
    setSelectedShip(index);
    setSuperPhase('a');
    setSuperPosA(null);
  };

  const handleRotate = () => {
    setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'));
  };

  const handleReset = () => {
    setPlacedShips([]);
    setSelectedShip(null);
    setSuperPhase('a');
    setSuperPosA(null);
  };

  const handleLockIn = () => {
    if (placedShips.length !== SHIPS.length) return;
    onPlaceShips(placedShips);
  };

  const allPlaced = placedShips.length === SHIPS.length;

  return (
    <div className="ship-placer">
      <div className="placer-sidebar">
        <h2 className="placer-title">Deploy Your Fleet</h2>
        <p className="placer-subtitle">
          Select a ship, choose classical or quantum placement, then click the grid.
          Quantum ships exist in two locations until observed!
        </p>

        {/* Ship List */}
        <div className="ship-list">
          {SHIPS.map((ship, i) => {
            const isPlaced = placedShips.some((ps) => ps.name === ship.name);
            const isSelected = selectedShip === i;
            return (
              <div
                key={ship.name}
                className={`ship-item ${isSelected ? 'ship-item-selected' : ''} ${isPlaced ? 'ship-item-placed' : ''}`}
                onClick={() => handleSelectShip(i)}
                id={`ship-${ship.name.toLowerCase()}`}
              >
                <div className="ship-info">
                  <span className="ship-name">{ship.name}</span>
                  <span className="ship-size">({ship.size})</span>
                </div>
                <div className="ship-cells">
                  {Array.from({ length: ship.size }, (_, j) => (
                    <div key={j} className="ship-cell-preview" />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Placement Controls */}
        {selectedShip !== null && (
          <div className="placement-controls">
            <div className="placement-mode-toggle">
              <button
                className={`mode-btn mode-btn-classical ${placementMode === 'classical' ? 'mode-btn-active' : ''}`}
                onClick={() => { setPlacementMode('classical'); setSuperPhase('a'); setSuperPosA(null); }}
              >
                ⚓ Classical
              </button>
              <button
                className={`mode-btn mode-btn-quantum ${placementMode === 'superposition' ? 'mode-btn-active' : ''}`}
                onClick={() => { setPlacementMode('superposition'); setSuperPhase('a'); setSuperPosA(null); }}
              >
                ⟨ψ⟩ Quantum
              </button>
            </div>

            <button className="orientation-btn" onClick={handleRotate}>
              🔄 {orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
            </button>

            {placementMode === 'superposition' && (
              <div className="quantum-instruction">
                {superPhase === 'a'
                  ? '🟣 Click to place Position A (purple)'
                  : '🔵 Click to place Position B (cyan)'}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="placer-actions">
          <button className="btn btn-secondary" onClick={handleReset} disabled={disabled || placedShips.length === 0}>
            Reset Fleet
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleLockIn}
            disabled={disabled || !allPlaced}
            id="lock-in-fleet"
          >
            {allPlaced ? '🚀 Lock In Fleet' : `Place ${SHIPS.length - placedShips.length} more ship(s)`}
          </button>
        </div>
      </div>

      {/* Grid */}
      <Grid
        cells={gridCells}
        onCellClick={handleCellClick}
        onCellHover={(x, y) => setHoverPos({ x, y })}
        onCellLeave={() => setHoverPos(null)}
        disabled={disabled}
        previewCells={previewCells}
        label="Your Fleet"
      />
    </div>
  );
}
