import './ControlPanel.css';

// ── Types ────────────────────────────────────────────────────────────────

interface ShipStatus {
  name: string;
  size: number;
  hits: boolean[];
  sunk: boolean;
  isQuantum: boolean;
  collapsed: boolean;
}

interface MoveEntry {
  player: 'you' | 'opponent';
  x: number;
  y: number;
  result: 'hit' | 'miss' | 'quantum_ghost' | 'sunk';
  shipName?: string;
  collapsed?: boolean;
}

interface ControlPanelProps {
  isYourTurn: boolean;
  yourShips: ShipStatus[];
  opponentShips: ShipStatus[];
  moves: MoveEntry[];
  gameStatus: string;
}

// Row labels for display
const ROW_LABELS = 'ABCDEFGHIJ'.split('');

function coordLabel(x: number, y: number): string {
  return `${ROW_LABELS[y]}${x + 1}`;
}

function resultIcon(result: string): string {
  switch (result) {
    case 'hit': return '💥';
    case 'miss': return '🌊';
    case 'quantum_ghost': return '👻';
    case 'sunk': return '☠️';
    default: return '•';
  }
}

function resultClass(result: string): string {
  switch (result) {
    case 'hit': return 'move-entry-hit';
    case 'miss': return 'move-entry-miss';
    case 'quantum_ghost': return 'move-entry-ghost';
    case 'sunk': return 'move-entry-sunk';
    default: return '';
  }
}

// ── Component ────────────────────────────────────────────────────────────

export default function ControlPanel({
  isYourTurn,
  yourShips,
  opponentShips,
  moves,
  gameStatus,
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      {/* Turn Indicator */}
      {gameStatus === 'in_progress' && (
        <div className="turn-indicator">
          <div className={`turn-orb ${isYourTurn ? 'turn-orb-active' : 'turn-orb-waiting'}`} />
          <span className={`turn-text ${isYourTurn ? 'turn-text-active' : 'turn-text-waiting'}`}>
            {isYourTurn ? 'Your Turn — Fire!' : "Opponent's Turn..."}
          </span>
        </div>
      )}

      {/* Opponent Ship Tracker */}
      <div className="ship-tracker">
        <div className="tracker-title">Enemy Fleet</div>
        {opponentShips.map((ship) => (
          <div key={ship.name} className="tracker-ship">
            <span className={`tracker-ship-name ${ship.sunk ? 'tracker-ship-name-sunk' : ''}`}>
              {ship.name}
            </span>
            <div className="tracker-ship-cells">
              {ship.hits.map((hit, i) => (
                <div
                  key={i}
                  className={`tracker-cell ${
                    ship.sunk ? 'tracker-cell-sunk' :
                    hit ? 'tracker-cell-hit' :
                    (!ship.collapsed && ship.isQuantum) ? 'tracker-cell-quantum' : ''
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Your Ship Tracker */}
      <div className="ship-tracker">
        <div className="tracker-title">Your Fleet</div>
        {yourShips.map((ship) => (
          <div key={ship.name} className="tracker-ship">
            <span className={`tracker-ship-name ${ship.sunk ? 'tracker-ship-name-sunk' : ''}`}>
              {ship.name}
            </span>
            <div className="tracker-ship-cells">
              {ship.hits.map((hit, i) => (
                <div
                  key={i}
                  className={`tracker-cell ${
                    ship.sunk ? 'tracker-cell-sunk' :
                    hit ? 'tracker-cell-hit' :
                    (!ship.collapsed && ship.isQuantum) ? 'tracker-cell-quantum' : ''
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Move Log */}
      <div className="move-log">
        <div className="move-log-title">Battle Log</div>
        <div className="move-log-entries">
          {moves.length === 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No moves yet...
            </div>
          )}
          {[...moves].reverse().map((move, i) => (
            <div key={i} className={`move-entry ${resultClass(move.result === 'quantum_ghost' && move.player === 'you' ? 'miss' : move.result)}`}>
              <span className="move-icon">{resultIcon(move.result === 'quantum_ghost' && move.player === 'you' ? 'miss' : move.result)}</span>
              <span className="move-coord">{coordLabel(move.x, move.y)}</span>
              <span>
                {move.player === 'you' ? 'You' : 'Opp'} →{' '}
                {move.result === 'quantum_ghost'
                  ? (move.player === 'you' ? 'Miss' : `Ghost (${move.shipName})`)
                  : move.result === 'sunk'
                  ? `Sunk ${move.shipName}!`
                  : move.result === 'hit'
                  ? `Hit${move.shipName ? ` ${move.shipName}` : ''}`
                  : 'Miss'}
                {move.collapsed && move.player === 'opponent' ? ' ⟨ψ↓⟩' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
