import './Lobby.css';

interface LobbyProps {
  username: string;
  matchesPlayed: number;
  matchesWon: number;
  onFindMatch: () => void;
  searching: boolean;
}

export default function Lobby({
  username,
  matchesPlayed,
  matchesWon,
  onFindMatch,
  searching,
}: LobbyProps) {
  if (searching) {
    return (
      <div className="lobby">
        <div className="searching-animation">
          <div className="quantum-spinner" />
          <div className="searching-text">
            Searching for an opponent<span className="searching-dots" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Entangling quantum channels...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <div className="lobby-hero">
        <div className="lobby-emoji">⚛️🚢</div>
        <h1 className="lobby-title">Welcome, {username}</h1>
        <p className="lobby-subtitle">
          Place your fleet in quantum superposition. Fire to collapse the wave function.
          Sink all enemy ships to achieve quantum supremacy.
        </p>
      </div>

      {/* Player Stats */}
      <div className="lobby-stats">
        <div className="stat-card">
          <span className="stat-value">{matchesPlayed}</span>
          <span className="stat-label">Battles</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{matchesWon}</span>
          <span className="stat-label">Victories</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {matchesPlayed > 0 ? `${Math.round((matchesWon / matchesPlayed) * 100)}%` : '—'}
          </span>
          <span className="stat-label">Win Rate</span>
        </div>
      </div>

      {/* Find Match */}
      <div className="lobby-actions">
        <button className="find-match-btn" onClick={onFindMatch} id="find-match-btn">
          ⚛️ Find Match
        </button>
      </div>

      {/* Rules */}
      <div className="lobby-rules">
        <div className="rules-title">📋 How Quantum Battleship Works</div>
        <ul className="rules-list">
          <li>Place 5 ships — classically or in <strong>quantum superposition</strong></li>
          <li>Quantum ships exist in <strong>two locations simultaneously</strong> (50/50)</li>
          <li>Firing at a quantum ship acts as <strong>observation</strong> — collapsing its wave function</li>
          <li><strong>👻 Quantum Ghost:</strong> The ship wasn't there — it collapsed to the other position</li>
          <li><strong>💥 Hit:</strong> The ship collapsed HERE and took damage</li>
          <li>Sink all 5 enemy ships to win!</li>
        </ul>
      </div>
    </div>
  );
}
