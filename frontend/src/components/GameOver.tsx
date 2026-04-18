import './GameOver.css';

interface GameOverProps {
  isWinner: boolean;
  winnerUsername: string;
  totalMoves: number;
  shipsRemaining: number;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export default function GameOver({
  isWinner,
  winnerUsername,
  totalMoves,
  shipsRemaining,
  onPlayAgain,
  onBackToLobby,
}: GameOverProps) {
  return (
    <div className={`game-over ${isWinner ? 'game-over-win' : 'game-over-loss'}`}>
      <div className="game-over-card">
        <div className="game-over-emoji">
          {isWinner ? '🏆' : '💀'}
        </div>
        <h1 className="game-over-title">
          {isWinner ? 'Quantum Supremacy!' : 'Wave Function Collapsed'}
        </h1>
        <p className="game-over-subtitle">
          {isWinner
            ? 'You successfully collapsed all enemy quantum states!'
            : `${winnerUsername} achieved quantum supremacy over your fleet.`}
        </p>

        <div className="game-over-stats">
          <div className="game-over-stat">
            <span className="game-over-stat-value">{totalMoves}</span>
            <span className="game-over-stat-label">Total Moves</span>
          </div>
          <div className="game-over-stat">
            <span className="game-over-stat-value">{shipsRemaining}</span>
            <span className="game-over-stat-label">Ships Left</span>
          </div>
        </div>

        <div className="game-over-actions">
          <button className="btn btn-primary btn-lg" onClick={onPlayAgain} id="play-again-btn">
            ⚛️ Play Again
          </button>
          <button className="btn btn-secondary" onClick={onBackToLobby}>
            Back to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
