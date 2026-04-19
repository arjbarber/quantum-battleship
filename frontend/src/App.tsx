import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import LoginScreen from './components/LoginScreen';
import Lobby from './components/Lobby';
import ShipPlacer from './components/ShipPlacer';
import Grid, { createEmptyGrid } from './components/Grid';
import type { CellData, CellState } from './components/Grid';
import ControlPanel from './components/ControlPanel';
import GameOver from './components/GameOver';
import './App.css';

// ── Types ────────────────────────────────────────────────────────────────

type GamePhase = 'login' | 'lobby' | 'searching' | 'placing' | 'playing' | 'game_over';

interface ShipStatus {
  name: string;
  size: number;
  hits: boolean[]; // For tracked view (attacker)
  sunk: boolean;
  isQuantum: boolean;
  collapsed: boolean;
  hits_a?: boolean[]; // For defender view
  hits_b?: boolean[]; // For defender view
}

interface MoveEntry {
  player: 'you' | 'opponent';
  x: number;
  y: number;
  result: 'hit' | 'miss' | 'quantum_ghost' | 'sunk';
  shipName?: string;
  collapsed?: boolean;
}

interface GameState {
  gameId: string;
  playerNumber: number;
  opponentUsername: string;
  currentTurn: string;
  isYourTurn: boolean;
  myBoard: CellData[][];
  opponentBoard: CellData[][];
  yourShips: ShipStatus[];
  opponentShips: ShipStatus[];
  moves: MoveEntry[];
  winnerId: string | null;
  winnerUsername: string;
}

// Default ship list for opponent tracking (before we know hits)
const DEFAULT_SHIP_LIST: ShipStatus[] = [
  { name: 'Carrier', size: 5, hits: Array(5).fill(false), sunk: false, isQuantum: false, collapsed: true, hits_a: Array(5).fill(false) },
  { name: 'Battleship', size: 4, hits: Array(4).fill(false), sunk: false, isQuantum: false, collapsed: true, hits_a: Array(4).fill(false) },
  { name: 'Cruiser', size: 3, hits: Array(3).fill(false), sunk: false, isQuantum: false, collapsed: true, hits_a: Array(3).fill(false) },
  { name: 'Submarine', size: 3, hits: Array(3).fill(false), sunk: false, isQuantum: false, collapsed: true, hits_a: Array(3).fill(false) },
  { name: 'Destroyer', size: 2, hits: Array(2).fill(false), sunk: false, isQuantum: false, collapsed: true, hits_a: Array(2).fill(false) },
];

// ── App ──────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading: authLoading, error: authError, login, signup, logout, updateStats } = useAuth();
  const { connected, socketId, emit, on, off } = useSocket();

  const [phase, setPhase] = useState<GamePhase>('login');
  const [placementLocked, setPlacementLocked] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const [game, setGame] = useState<GameState>({
    gameId: '',
    playerNumber: 0,
    opponentUsername: '',
    currentTurn: '',
    isYourTurn: false,
    myBoard: createEmptyGrid(),
    opponentBoard: createEmptyGrid(),
    yourShips: [],
    opponentShips: structuredClone(DEFAULT_SHIP_LIST),
    moves: [],
    winnerId: null,
    winnerUsername: '',
  });

  // Transition to lobby when user logs in
  useEffect(() => {
    if (user && phase === 'login') {
      setPhase('lobby');
    }
    if (!user) {
      setPhase('login');
    }
  }, [user]);

  // Set username on socket when connected + logged in
  useEffect(() => {
    if (connected && user) {
      emit('set_username', { 
        username: user.username, 
        user_id: user.id 
      });
    }
  }, [connected, user, emit]);

  // ── Socket Event Handlers ──────────────────────────────────────────────

  useEffect(() => {
    if (!connected) return;

    const handleMatchFound = (data: any) => {
      console.log('[Game] Match found:', data);
      setGame((g) => ({
        ...g,
        gameId: data.game_id,
        playerNumber: data.player_number,
        opponentUsername: data.opponent_username,
        opponentShips: structuredClone(DEFAULT_SHIP_LIST),
        moves: [],
        winnerId: null,
        winnerUsername: '',
      }));
      setPhase('placing');
      setPlacementLocked(false);
      setOpponentReady(false);
    };

    const handleShipsPlaced = () => {
      setPlacementLocked(true);
    };

    const handleOpponentReady = () => {
      setOpponentReady(true);
    };

    const handleGameStart = (data: any) => {
      console.log('[Game] Game started:', data);
      const sid = socketId;
      setGame((g) => ({
        ...g,
        currentTurn: data.current_turn,
        isYourTurn: data.current_turn === sid,
      }));
      setPhase('playing');
    };

    const handleFireResult = (data: any) => {
      console.log('[Game] Fire result:', data);

      setGame((g) => {
        const newOpponentBoard = g.opponentBoard.map((row) => row.map((cell) => ({ ...cell })));

        // Update opponent board
        let cellState: CellState = 'miss';
        if (data.result === 'hit') cellState = 'hit';
        else if (data.result === 'sunk') cellState = 'sunk';
        else if (data.result === 'quantum_ghost') cellState = 'quantum-ghost';
        newOpponentBoard[data.y][data.x].state = cellState;

        // If sunk, mark all cells of the sunk ship
        // (we don't have positions here, so just update the cell)

        // Update opponent ship tracker
        const newOppShips = g.opponentShips.map((s) => ({ ...s, hits: [...s.hits] }));
        if (data.ship_name && (data.result === 'hit' || data.result === 'sunk')) {
          const ship = newOppShips.find((s) => s.name === data.ship_name);
          if (ship) {
            const nextHitIdx = ship.hits.indexOf(false);
            if (nextHitIdx !== -1) ship.hits[nextHitIdx] = true;
            if (data.result === 'sunk') {
              ship.sunk = true;
              ship.hits = ship.hits.map(() => true);
            }
          }
        }

        const newMove: MoveEntry = {
          player: 'you',
          x: data.x,
          y: data.y,
          result: data.result,
          shipName: data.ship_name,
          collapsed: data.collapsed,
        };

        return {
          ...g,
          opponentBoard: newOpponentBoard,
          opponentShips: newOppShips,
          currentTurn: data.current_turn,
          isYourTurn: !data.game_over && data.current_turn === socketId,
          moves: [...g.moves, newMove],
          winnerId: data.game_over ? data.winner_id : null,
        };
      });

      // Show result notification
      if (data.result === 'quantum_ghost') {
        setLastResult(`👻 Quantum Ghost! ${data.ship_name} was a phantom!`);
      } else if (data.result === 'sunk') {
        setLastResult(`☠️ Sunk ${data.ship_name}!`);
      } else if (data.result === 'hit') {
        setLastResult(`💥 Hit!`);
      } else {
        setLastResult('🌊 Miss');
      }

      setTimeout(() => setLastResult(null), 3000);

      if (data.game_over) {
        setTimeout(() => setPhase('game_over'), 1500);
      }
    };

    const handleOpponentFired = (data: any) => {
      console.log('[Game] Opponent fired:', data);

      setGame((g) => {
        // Update own board from server state
        let newMyBoard = g.myBoard.map((row) => row.map((cell) => ({ ...cell })));

        if (data.board_state) {
          // Rebuild own board from server state
          newMyBoard = createEmptyGrid();
          for (const ship of data.board_state) {
            // Position A cells
            for (let i = 0; i < ship.positions_a.length; i++) {
              const [sx, sy] = ship.positions_a[i];
              if (ship.hits_a[i]) {
                if (ship.collapsed_to === 'a' || !ship.collapsed) {
                  newMyBoard[sy][sx].state = ship.sunk ? 'sunk' : 'hit';
                } else {
                  newMyBoard[sy][sx].state = 'phantom-hit';
                }
              } else if (!ship.collapsed) {
                newMyBoard[sy][sx].state = 'superposition-a';
              } else if (ship.collapsed_to === 'a') {
                newMyBoard[sy][sx].state = 'ship';
              }
            }

            // Position B cells (if superposition)
            if (ship.placement_type === 'superposition' && ship.positions_b) {
              for (let i = 0; i < ship.positions_b.length; i++) {
                const [sx, sy] = ship.positions_b[i];
                if (ship.hits_b[i]) {
                  if (ship.collapsed_to === 'b' || !ship.collapsed) {
                    newMyBoard[sy][sx].state = ship.sunk ? 'sunk' : 'hit';
                  } else {
                    newMyBoard[sy][sx].state = 'phantom-hit';
                  }
                } else if (!ship.collapsed) {
                  newMyBoard[sy][sx].state = 'superposition-b';
                } else if (ship.collapsed_to === 'b') {
                  newMyBoard[sy][sx].state = 'ship';
                }
              }
            }
          }

          // Update your ship tracker
          const newYourShips: ShipStatus[] = data.board_state.map((s: any) => ({
            name: s.name,
            size: s.size,
            hits: s.collapsed_to === 'b' ? s.hits_b : s.hits_a,
            sunk: s.sunk,
            isQuantum: s.placement_type === 'superposition',
            collapsed: s.collapsed,
            hits_a: s.hits_a,
            hits_b: s.hits_b,
          }));

          const newMove: MoveEntry = {
            player: 'opponent',
            x: data.x,
            y: data.y,
            result: data.result,
            shipName: data.ship_name,
            collapsed: data.collapsed,
          };

          return {
            ...g,
            myBoard: newMyBoard,
            yourShips: newYourShips,
            currentTurn: data.current_turn,
            isYourTurn: !data.game_over && data.current_turn === socketId,
            moves: [...g.moves, newMove],
            winnerId: data.game_over ? data.winner_id : null,
          };
        }

        return g;
      });

      if (data.game_over) {
        setTimeout(() => setPhase('game_over'), 1500);
      }
    };

    const handleStatsUpdated = (data: any) => {
      console.log('[Auth] Stats updated:', data);
      updateStats(data.matches_played, data.matches_won);
    };

    const handleGameOver = (data: any) => {
      console.log('[Game] Game over:', data);
      setGame((g) => ({
        ...g,
        winnerId: data.winner_id,
        winnerUsername: data.winner_username,
      }));
      setPhase('game_over');
    };

    const handleOpponentDisconnected = (data: any) => {
      console.log('[Game] Opponent disconnected:', data);
      setGame((g) => ({
        ...g,
        winnerId: user?.id || '',
        winnerUsername: user?.username || 'You',
      }));
      setPhase('game_over');
    };

    const handleError = (data: any) => {
      console.error('[Game] Server error:', data.message);
    };


    on('match_found', handleMatchFound);
    on('ships_placed', handleShipsPlaced);
    on('opponent_ready', handleOpponentReady);
    on('game_start', handleGameStart);
    on('fire_result', handleFireResult);
    on('opponent_fired', handleOpponentFired);
    on('game_over', handleGameOver);
    on('stats_updated', handleStatsUpdated);
    on('opponent_disconnected', handleOpponentDisconnected);
    on('error', handleError);

    return () => {
      off('match_found', handleMatchFound);
      off('ships_placed', handleShipsPlaced);
      off('opponent_ready', handleOpponentReady);
      off('game_start', handleGameStart);
      off('fire_result', handleFireResult);
      off('opponent_fired', handleOpponentFired);
      off('game_over', handleGameOver);
      off('stats_updated', handleStatsUpdated);
      off('opponent_disconnected', handleOpponentDisconnected);
      off('error', handleError);
    };
  }, [connected, socketId, on, off, user, updateStats]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleFindMatch = useCallback(() => {
    setPhase('searching');
    emit('find_match');
  }, [emit]);

  const handlePlaceShips = useCallback((ships: any[]) => {
    emit('place_ships', { game_id: game.gameId, ships });

    // Build own board visualization
    const newBoard = createEmptyGrid();
    const yourShips: ShipStatus[] = [];

    for (const ship of ships) {
      const isSuper = ship.placement_type === 'superposition';
      const size = ship.size;

      // Position A
      for (let i = 0; i < size; i++) {
        const x = ship.orientation_a === 'horizontal' ? ship.x_a + i : ship.x_a;
        const y = ship.orientation_a === 'horizontal' ? ship.y_a : ship.y_a + i;
        newBoard[y][x].state = isSuper ? 'superposition-a' : 'ship';
      }

      // Position B (superposition)
      if (isSuper && ship.x_b !== undefined) {
        for (let i = 0; i < size; i++) {
          const x = ship.orientation_b === 'horizontal' ? ship.x_b + i : ship.x_b;
          const y = ship.orientation_b === 'horizontal' ? ship.y_b : ship.y_b + i;
          newBoard[y][x].state = 'superposition-b';
        }
      }

      yourShips.push({
        name: ship.name,
        size: ship.size,
        hits: Array(ship.size).fill(false),
        sunk: false,
        isQuantum: isSuper,
        collapsed: !isSuper,
      });
    }

    setGame((g) => ({ ...g, myBoard: newBoard, yourShips }));
  }, [emit, game.gameId]);

  const handleFire = useCallback((x: number, y: number) => {
    if (!game.isYourTurn) return;
    if (game.opponentBoard[y][x].state !== 'empty') return;
    emit('fire', { game_id: game.gameId, x, y });
  }, [emit, game.gameId, game.isYourTurn, game.opponentBoard]);

  const handlePlayAgain = useCallback(() => {
    setPhase('searching');
    setGame((g) => ({
      ...g,
      opponentBoard: createEmptyGrid(),
      myBoard: createEmptyGrid(),
      opponentShips: structuredClone(DEFAULT_SHIP_LIST),
      yourShips: [],
      moves: [],
      winnerId: null,
      winnerUsername: '',
    }));
    emit('find_match');
  }, [emit]);

  const handleBackToLobby = useCallback(() => {
    setPhase('lobby');
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────

  if (phase === 'login' || !user) {
    return <LoginScreen onLogin={login} onSignup={signup} error={authError} loading={authLoading} />;
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <h1>Quantum Battleship</h1>
        </div>
        <div className="app-header-right">
          <div className="user-badge">
            <div className="user-badge-dot" style={{ background: connected ? '#22c55e' : '#ef4444' }} />
            <span>{user.username}</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* Turn Banner (during gameplay) */}
      {phase === 'playing' && (
        <div className={`turn-banner ${game.isYourTurn ? 'turn-banner-your-turn' : 'turn-banner-waiting'}`}>
          {game.isYourTurn
            ? `⚛️ Your turn — Select a target on ${game.opponentUsername}'s grid`
            : `⏳ Waiting for ${game.opponentUsername} to fire...`}
        </div>
      )}

      {/* Last Result Notification */}
      {lastResult && phase === 'playing' && (
        <div className={`status-message ${
          lastResult.includes('Hit') ? 'status-hit' :
          lastResult.includes('Sunk') ? 'status-sunk' :
          lastResult.includes('Ghost') ? 'status-ghost' :
          'status-miss'
        }`}>
          {lastResult}
        </div>
      )}

      {/* Phase Content */}
      {phase === 'lobby' && (
        <Lobby
          username={user.username}
          matchesPlayed={user.matchesPlayed}
          matchesWon={user.matchesWon}
          onFindMatch={handleFindMatch}
          searching={false}
        />
      )}

      {phase === 'searching' && (
        <Lobby
          username={user.username}
          matchesPlayed={user.matchesPlayed}
          matchesWon={user.matchesWon}
          onFindMatch={handleFindMatch}
          searching={true}
        />
      )}

      {phase === 'placing' && (
        <div style={{ padding: '16px 0' }}>
          {opponentReady && (
            <div className="status-message" style={{
              background: 'rgba(34, 197, 94, 0.1)',
              color: '#22c55e',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              marginBottom: 16,
              justifyContent: 'center',
            }}>
              ✅ {game.opponentUsername} has placed their fleet!
            </div>
          )}
          {placementLocked && (
            <div className="status-message" style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent-vivid)',
              border: '1px solid var(--border-accent)',
              marginBottom: 16,
              justifyContent: 'center',
            }}>
              🔒 Your fleet is locked in! Waiting for opponent...
            </div>
          )}
          <ShipPlacer onPlaceShips={handlePlaceShips} disabled={placementLocked} />
        </div>
      )}

      {phase === 'playing' && (
        <div className="game-layout">
          {/* Your Board */}
          <Grid
            cells={game.myBoard}
            label="Your Fleet"
          />

          {/* Control Panel */}
          <ControlPanel
            isYourTurn={game.isYourTurn}
            yourShips={game.yourShips}
            opponentShips={game.opponentShips}
            moves={game.moves}
            gameStatus="in_progress"
          />

          {/* Opponent Board */}
          <Grid
            cells={game.opponentBoard}
            onCellClick={handleFire}
            isOpponent={true}
            disabled={!game.isYourTurn}
            label={`${game.opponentUsername}'s Fleet`}
          />
        </div>
      )}

      {phase === 'game_over' && (
        <GameOver
          isWinner={game.winnerId === socketId || game.winnerUsername === user.username}
          winnerUsername={game.winnerUsername || 'Unknown'}
          totalMoves={game.moves.length}
          shipsRemaining={game.yourShips.filter((s) => !s.sunk).length}
          onPlayAgain={handlePlayAgain}
          onBackToLobby={handleBackToLobby}
        />
      )}
    </div>
  );
}
