"""
Socket Event Handlers — WebSocket events for Quantum Battleship.

All game communication flows through these handlers:
  - find_match → matchmaking queue
  - place_ships → fleet placement + validation
  - fire → attack processing + quantum collapse
  - disconnect → cleanup
"""

from __future__ import annotations
from flask_socketio import SocketIO, emit, join_room, leave_room
from game_state import GameManager
from matchmaking import Matchmaker
from db_utils import update_player_stats, complete_game_record


def register_events(socketio: SocketIO, game_manager: GameManager, supabase):
    """Register all Socket.IO event handlers."""

    matchmaker = Matchmaker(game_manager)

    # Map socket SID → player info
    connected_players: dict[str, dict] = {}

    @socketio.on("connect")
    def on_connect(data=None):
        from flask import request
        sid = request.sid
        print(f"[WS] Player connected: {sid}")
        connected_players[sid] = {"sid": sid, "username": None, "user_id": None}

    @socketio.on("set_username")
    def on_set_username(data):
        from flask import request
        sid = request.sid
        username = data.get("username", "Unknown")
        user_id = data.get("user_id")
        connected_players[sid] = {"sid": sid, "username": username, "user_id": user_id}
        emit("username_set", {"username": username})
        print(f"[WS] Player {sid} set username: {username} (UserID: {user_id})")

    @socketio.on("find_match")
    def on_find_match(data=None):
        from flask import request
        sid = request.sid
        print(f"[WS] Player {sid} looking for match...")

        game = matchmaker.enqueue(sid)

        if game is None:
            # Player is in the queue, waiting
            emit("waiting_for_opponent", {"message": "Searching for opponent..."})
            print(f"[WS] Player {sid} waiting in queue")
        else:
            # Match found! Both players get notified
            p1 = game.player_1_id
            p2 = game.player_2_id

            # Both join a socketio room for this game
            join_room(game.game_id, sid=p1)
            join_room(game.game_id, sid=p2)

            p1_username = connected_players.get(p1, {}).get("username", "Player 1")
            p2_username = connected_players.get(p2, {}).get("username", "Player 2")

            # Notify Player 1
            socketio.emit("match_found", {
                "game_id": game.game_id,
                "player_number": 1,
                "opponent_username": p2_username,
            }, to=p1)

            # Notify Player 2
            socketio.emit("match_found", {
                "game_id": game.game_id,
                "player_number": 2,
                "opponent_username": p1_username,
            }, to=p2)

            print(f"[WS] Match created: {game.game_id} ({p1} vs {p2})")

    @socketio.on("place_ships")
    def on_place_ships(data):
        from flask import request
        sid = request.sid
        game_id = data.get("game_id")
        ships = data.get("ships", [])

        game = game_manager.get_game(game_id)
        if game is None:
            emit("error", {"message": "Game not found"})
            return

        success, error = game.place_ships(sid, ships)

        if not success:
            emit("error", {"message": f"Invalid placement: {error}"})
            return

        emit("ships_placed", {"message": "Your fleet is locked in!"})
        print(f"[WS] Player {sid} placed ships in game {game_id}")

        # Notify opponent that this player is ready
        opponent_id = game.get_opponent_id(sid)
        if opponent_id:
            socketio.emit("opponent_ready", {
                "message": "Opponent has placed their fleet!"
            }, to=opponent_id)

        # If both players placed, start the game
        if game.both_placed():
            socketio.emit("game_start", {
                "game_id": game.game_id,
                "current_turn": game.current_turn,
                "message": "All ships placed! Battle begins!",
            }, to=game.game_id)
            print(f"[WS] Game {game_id} started! Turn: {game.current_turn}")

    @socketio.on("fire")
    def on_fire(data):
        from flask import request
        sid = request.sid
        game_id = data.get("game_id")
        x = data.get("x")
        y = data.get("y")

        game = game_manager.get_game(game_id)
        if game is None:
            emit("error", {"message": "Game not found"})
            return

        success, result = game.fire(sid, x, y)

        if not success:
            emit("error", {"message": result.get("error", "Invalid move")})
            return

        # Send result to the attacker (SANITIZED - hide quantum info)
        attacker_result = result["result"]
        if attacker_result == "quantum_ghost":
            attacker_result = "miss"

        emit("fire_result", {
            "x": x,
            "y": y,
            "result": attacker_result,
            "ship_name": result.get("ship_name"),
            "collapsed": False, # Hide collapse status from attacker
            "collapsed_to": None,
            "sunk_ship": result.get("sunk_ship"),
            "game_over": result.get("game_over", False),
            "winner_id": result.get("winner_id"),
            "current_turn": game.current_turn,
        })

        # Send result to the opponent (different perspective!)
        opponent_id = game.get_opponent_id(sid)
        if opponent_id:
            # Build opponent's data — they see:
            #   - where the shot landed
            #   - if their ship was hit/collapsed
            #   - their own updated board state
            opponent_board = game.get_own_board_state(opponent_id)

            socketio.emit("opponent_fired", {
                "x": x,
                "y": y,
                "result": result["result"],
                "ship_name": result.get("ship_name"),
                "collapsed": result.get("collapsed", False),
                "collapsed_to": result.get("collapsed_to"),
                "sunk_ship": result.get("sunk_ship"),
                "game_over": result.get("game_over", False),
                "winner_id": result.get("winner_id"),
                "current_turn": game.current_turn,
                "board_state": opponent_board,
            }, to=opponent_id)

        attacker_username = connected_players.get(sid, {}).get("username", sid[:8])
        print(
            f"[WS] {attacker_username} fired at ({x},{y}) → "
            f"{result['result']}"
            f"{' [COLLAPSE → ' + result['collapsed_to'] + ']' if result.get('collapsed') else ''}"
            f"{' [SUNK ' + result['sunk_ship'] + ']' if result.get('sunk_ship') else ''}"
        )

        # Handle game over
        if result.get("game_over"):
            winner_id = result["winner_id"]
            winner_username = connected_players.get(
                winner_id, {}
            ).get("username", "Unknown")

            # Update DB Stats
            p1_id = game.player_1_id
            p2_id = game.player_2_id
            
            p1_uid = connected_players.get(p1_id, {}).get("user_id")
            p2_uid = connected_players.get(p2_id, {}).get("user_id")
            winner_uid = connected_players.get(winner_id, {}).get("user_id")

            if p1_uid and p2_uid:
                # Update profiles
                update_player_stats(supabase, p1_uid, won=(winner_id == p1_id))
                update_player_stats(supabase, p2_uid, won=(winner_id == p2_id))
                # Update game record
                complete_game_record(supabase, game.game_id, winner_uid)

            socketio.emit("game_over", {
                "winner_id": winner_id,
                "winner_username": winner_username,
                "message": f"{winner_username} wins the battle!",
            }, to=game.game_id)
            print(f"[WS] Game {game.game_id} over! Winner: {winner_username}")

    @socketio.on("request_board_state")
    def on_request_board_state(data=None):
        """Player requests their current board state (reconnect support)."""
        from flask import request
        sid = request.sid
        game = game_manager.get_player_game(sid)
        if game is None:
            emit("error", {"message": "No active game"})
            return

        emit("board_state", {
            "own_board": game.get_own_board_state(sid),
            "opponent_view": game.get_opponent_board_view(sid),
            "game": game.to_dict(),
        })

    @socketio.on("disconnect")
    def on_disconnect():
        from flask import request
        sid = request.sid
        print(f"[WS] Player disconnected: {sid}")

        # Remove from matchmaking queue
        matchmaker.dequeue(sid)

        # Handle mid-game disconnects
        game = game_manager.get_player_game(sid)
        if game and game.status in ("placing", "in_progress"):
            opponent_id = game.get_opponent_id(sid)
            if opponent_id:
                # Award win to opponent
                opponent_uid = connected_players.get(opponent_id, {}).get("user_id")
                leaver_uid = connected_players.get(sid, {}).get("user_id")
                
                if opponent_uid and leaver_uid:
                    update_player_stats(supabase, opponent_uid, won=True)
                    update_player_stats(supabase, leaver_uid, won=False)
                    complete_game_record(supabase, game.game_id, opponent_uid)

                socketio.emit("opponent_disconnected", {
                    "message": "Your opponent has disconnected. You win!",
                }, to=opponent_id)
                game.status = "completed"
                game.winner_id = opponent_id

        game_manager.remove_player(sid)
        connected_players.pop(sid, None)
