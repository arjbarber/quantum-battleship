"""
Matchmaking — Simple queue-based player pairing.
"""

from __future__ import annotations
from typing import Optional
from game_state import GameManager, Game


class Matchmaker:
    """
    Simple FIFO matchmaking queue.
    When two players are queued, they are paired into a game.
    """

    def __init__(self, game_manager: GameManager):
        self.game_manager = game_manager
        self.queue: list[str] = []  # list of waiting player SIDs

    def enqueue(self, player_id: str) -> Optional[Game]:
        """
        Add a player to the matchmaking queue.
        If another player is already waiting, pair them and return the Game.
        Otherwise, return None (player is waiting).
        """
        # Don't double-queue
        if player_id in self.queue:
            return None

        # Check if player is already in a game
        existing = self.game_manager.get_player_game(player_id)
        if existing and existing.status not in ("completed",):
            return None

        if len(self.queue) > 0:
            # Match with the first waiting player
            opponent_id = self.queue.pop(0)

            # Create a game with opponent as P1, this player as P2
            game = self.game_manager.create_game(opponent_id)
            self.game_manager.join_game(game.game_id, player_id)
            return game
        else:
            # No one waiting — add to queue
            self.queue.append(player_id)
            return None

    def dequeue(self, player_id: str):
        """Remove a player from the queue (e.g., on disconnect)."""
        if player_id in self.queue:
            self.queue.remove(player_id)
