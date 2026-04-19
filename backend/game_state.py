"""
Game State Manager — In-memory game state backed by Supabase persistence.

Manages active games, player boards, turns, and move history.
"""

from __future__ import annotations
import uuid
from typing import Optional
from game_engine import validate_placement, build_board, process_attack, is_all_sunk, SHIPS


class Game:
    """Represents a single game session between two players."""

    def __init__(self, game_id: str, player_1_id: str):
        self.game_id = game_id
        self.player_1_id = player_1_id
        self.player_2_id: Optional[str] = None

        # Status: waiting_for_player → placing → in_progress → completed
        self.status = "waiting_for_player"
        self.current_turn: Optional[str] = None
        self.winner_id: Optional[str] = None

        # Board data per player — populated during placement phase
        self.boards: dict[str, list[dict]] = {}  # player_id → ship list
        self.placements_locked: dict[str, bool] = {}

        # Move history
        self.moves: list[dict] = []

        # Track which cells have been attacked (for opponent's view)
        self.attack_grids: dict[str, set[tuple[int, int]]] = {}

    def add_player_2(self, player_2_id: str):
        """Add the second player and transition to placing phase."""
        self.player_2_id = player_2_id
        self.status = "placing"
        self.placements_locked[self.player_1_id] = False
        self.placements_locked[self.player_2_id] = False
        self.attack_grids[self.player_1_id] = set()
        self.attack_grids[self.player_2_id] = set()

    def get_opponent_id(self, player_id: str) -> Optional[str]:
        """Get the opponent's player ID."""
        if player_id == self.player_1_id:
            return self.player_2_id
        elif player_id == self.player_2_id:
            return self.player_1_id
        return None

    def place_ships(self, player_id: str, ships_input: list[dict]) -> tuple[bool, str]:
        """
        Validate and store a player's ship placement.
        Returns (success, error_message).
        """
        if self.status != "placing":
            return False, "Game is not in placing phase"

        if player_id not in self.placements_locked:
            return False, "Player not in this game"

        if self.placements_locked[player_id]:
            return False, "Ships already locked in"

        valid, error = validate_placement(ships_input)
        if not valid:
            return False, error

        self.boards[player_id] = build_board(ships_input)
        self.placements_locked[player_id] = True

        # If both players have locked in, start the game
        if all(self.placements_locked.values()):
            self.status = "in_progress"
            self.current_turn = self.player_1_id  # Player 1 goes first

        return True, ""

    def both_placed(self) -> bool:
        """Check if both players have locked in their ships."""
        return all(self.placements_locked.values())

    def fire(self, player_id: str, x: int, y: int) -> tuple[bool, dict]:
        """
        Process a player's attack.
        Returns (success, result_dict).
        """
        if self.status != "in_progress":
            return False, {"error": "Game is not in progress"}

        if player_id != self.current_turn:
            return False, {"error": "Not your turn"}

        opponent_id = self.get_opponent_id(player_id)
        if opponent_id is None:
            return False, {"error": "Opponent not found"}

        # Check if this cell was already attacked
        if (x, y) in self.attack_grids[player_id]:
            return False, {"error": "Cell already attacked"}

        # Record the attack
        self.attack_grids[player_id].add((x, y))

        # Process against opponent's board
        result = process_attack(self.boards[opponent_id], x, y)

        # Record move
        move = {
            "id": str(uuid.uuid4()),
            "game_id": self.game_id,
            "player_id": player_id,
            "coordinate_x": x,
            "coordinate_y": y,
            "result": result["result"],
            "ship_name": result.get("ship_name"),
        }
        self.moves.append(move)

        # Check win condition
        if is_all_sunk(self.boards[opponent_id]):
            self.status = "completed"
            self.winner_id = player_id
            result["game_over"] = True
            result["winner_id"] = player_id
        else:
            result["game_over"] = False
            # Switch turns
            self.current_turn = opponent_id

        return True, result

    def get_own_board_state(self, player_id: str) -> list[dict]:
        """
        Get a player's own board state (full info — they can see
        their own superpositions).
        """
        if player_id not in self.boards:
            return []

        board = []
        for ship in self.boards[player_id]:
            board.append({
                "name": ship["name"],
                "size": ship["size"],
                "placement_type": ship["placement_type"],
                "positions_a": ship["positions_a"],
                "positions_b": ship["positions_b"],
                "collapsed": ship["collapsed"],
                "collapsed_to": ship["collapsed_to"],
                "hits_a": ship["hits_a"],
                "hits_b": ship["hits_b"],
                "sunk": ship["sunk"],
            })
        return board

    def get_opponent_board_view(self, player_id: str) -> dict:
        """
        Get what a player can see of their opponent's board.
        Only shows cells they've attacked and the results.
        NEVER reveals uncollapsed ship positions.
        """
        opponent_id = self.get_opponent_id(player_id)
        if opponent_id is None or opponent_id not in self.boards:
            return {"attacks": [], "sunk_ships": []}

        attacks = []
        for move in self.moves:
            if move["player_id"] == player_id:
                attacks.append({
                    "x": move["coordinate_x"],
                    "y": move["coordinate_y"],
                    "result": move["result"],
                    "ship_name": move.get("ship_name"),
                })

        # List of sunk ships (safe to reveal positions of sunk ships)
        sunk_ships = []
        for ship in self.boards[opponent_id]:
            if ship["sunk"]:
                actual_positions = (
                    ship["positions_a"] if ship["collapsed_to"] == "a"
                    else ship["positions_b"]
                )
                sunk_ships.append({
                    "name": ship["name"],
                    "positions": actual_positions,
                })

        return {"attacks": attacks, "sunk_ships": sunk_ships}

    def to_dict(self) -> dict:
        """Serialize game metadata (NOT board data) for clients."""
        return {
            "game_id": self.game_id,
            "player_1_id": self.player_1_id,
            "player_2_id": self.player_2_id,
            "status": self.status,
            "current_turn": self.current_turn,
            "winner_id": self.winner_id,
        }


class GameManager:
    """Manages all active games in memory."""

    def __init__(self):
        self.games: dict[str, Game] = {}  # game_id → Game
        self.player_games: dict[str, str] = {}  # player_id → game_id

    def create_game(self, player_1_id: str) -> Game:
        """Create a new game with Player 1."""
        game_id = str(uuid.uuid4())
        game = Game(game_id, player_1_id)
        self.games[game_id] = game
        self.player_games[player_1_id] = game_id
        return game

    def join_game(self, game_id: str, player_2_id: str) -> Optional[Game]:
        """Add Player 2 to an existing game."""
        game = self.games.get(game_id)
        if game is None or game.status != "waiting_for_player":
            return None
        game.add_player_2(player_2_id)
        self.player_games[player_2_id] = game_id
        return game

    def get_game(self, game_id: str) -> Optional[Game]:
        return self.games.get(game_id)

    def get_player_game(self, player_id: str) -> Optional[Game]:
        game_id = self.player_games.get(player_id)
        if game_id:
            return self.games.get(game_id)
        return None

    def remove_game(self, game_id: str):
        """Clean up a completed or abandoned game."""
        game = self.games.get(game_id)
        if game:
            self.player_games.pop(game.player_1_id, None)
            if game.player_2_id:
                self.player_games.pop(game.player_2_id, None)
            del self.games[game_id]

    def remove_player(self, player_id: str):
        """Remove a player from their current game."""
        self.player_games.pop(player_id, None)
