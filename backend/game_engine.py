"""
Game Engine — Core logic for Quantum Battleship.

Handles board validation, ship placement (classical & superposition),
attack processing with quantum wave-function collapse, hit/sink/win
detection.
"""

from __future__ import annotations
from typing import Optional
from quantum_rng import collapse_superposition


# ── Ship Definitions ──────────────────────────────────────────────────────

SHIPS = {
    "Carrier":    5,
    "Battleship": 4,
    "Cruiser":    3,
    "Submarine":  3,
    "Destroyer":  2,
}

GRID_SIZE = 10  # 10×10 board


# ── Helpers ───────────────────────────────────────────────────────────────

def compute_positions(x: int, y: int, size: int, orientation: str) -> list[list[int]]:
    """
    Compute all cell coordinates for a ship given its origin, size, and
    orientation ('horizontal' or 'vertical').
    """
    if orientation == "horizontal":
        return [[x + i, y] for i in range(size)]
    else:  # vertical
        return [[x, y + i] for i in range(size)]


def positions_in_bounds(positions: list[list[int]]) -> bool:
    """Check that every coordinate is within the 10×10 grid."""
    return all(0 <= x < GRID_SIZE and 0 <= y < GRID_SIZE for x, y in positions)


def positions_overlap(pos_a: list[list[int]], pos_b: list[list[int]]) -> bool:
    """Check if two sets of positions share any coordinate."""
    set_a = {tuple(p) for p in pos_a}
    set_b = {tuple(p) for p in pos_b}
    return bool(set_a & set_b)


# ── Board Validation ─────────────────────────────────────────────────────

def validate_placement(ships: list[dict]) -> tuple[bool, str]:
    """
    Validate a full fleet placement.

    Each ship dict must have:
        name:             str     — ship type name
        placement_type:   "classical" | "superposition"
        x_a, y_a:         int     — origin of Position A
        orientation_a:    str     — "horizontal" | "vertical"
        x_b, y_b:         int     — origin of Position B  (superposition only)
        orientation_b:    str     — (superposition only)

    Returns (valid: bool, error_message: str).
    """
    if len(ships) != len(SHIPS):
        return False, f"Expected {len(SHIPS)} ships, got {len(ships)}"

    seen_names = set()
    # Collect ALL occupied coordinates (every possible collapse outcome)
    # For classical ships: one set of positions
    # For superposition ships: we need to ensure no combination of
    # collapses produces an overlap
    all_classical_positions: list[list[list[int]]] = []
    all_super_positions: list[dict] = []  # {name, pos_a, pos_b}

    for ship in ships:
        name = ship.get("name", "")
        if name not in SHIPS:
            return False, f"Unknown ship: {name}"
        if name in seen_names:
            return False, f"Duplicate ship: {name}"
        seen_names.add(name)

        size = SHIPS[name]
        placement_type = ship.get("placement_type", "classical")

        # Position A (always required)
        pos_a = compute_positions(
            ship["x_a"], ship["y_a"], size, ship["orientation_a"]
        )
        if not positions_in_bounds(pos_a):
            return False, f"{name} Position A is out of bounds"

        if placement_type == "superposition":
            # Position B required
            if "x_b" not in ship or "y_b" not in ship:
                return False, f"{name} is superposition but missing Position B"
            pos_b = compute_positions(
                ship["x_b"], ship["y_b"], size, ship["orientation_b"]
            )
            if not positions_in_bounds(pos_b):
                return False, f"{name} Position B is out of bounds"

            # A and B must be different
            if pos_a == pos_b:
                return False, f"{name} Position A and B are identical"

            all_super_positions.append({
                "name": name, "pos_a": pos_a, "pos_b": pos_b
            })
        else:
            all_classical_positions.append(pos_a)

    # Classical ships must not overlap each other
    for i in range(len(all_classical_positions)):
        for j in range(i + 1, len(all_classical_positions)):
            if positions_overlap(all_classical_positions[i], all_classical_positions[j]):
                return False, "Classical ships overlap each other"

    # Classical ships must not overlap with ANY possible position of
    # superposed ships
    for classical_pos in all_classical_positions:
        for sp in all_super_positions:
            if positions_overlap(classical_pos, sp["pos_a"]) or \
               positions_overlap(classical_pos, sp["pos_b"]):
                return False, (
                    f"Classical ship overlaps with a possible position "
                    f"of {sp['name']}"
                )

    # Superposed ships: no two superposed ships should have overlapping
    # positions in ANY combination of collapses
    for i in range(len(all_super_positions)):
        for j in range(i + 1, len(all_super_positions)):
            sp_i = all_super_positions[i]
            sp_j = all_super_positions[j]
            # Check all 4 combinations: (A,A), (A,B), (B,A), (B,B)
            for pi in [sp_i["pos_a"], sp_i["pos_b"]]:
                for pj in [sp_j["pos_a"], sp_j["pos_b"]]:
                    if positions_overlap(pi, pj):
                        return False, (
                            f"Superposed ships {sp_i['name']} and "
                            f"{sp_j['name']} could overlap upon collapse"
                        )

    return True, ""


# ── Board Construction ────────────────────────────────────────────────────

def build_board(ships_input: list[dict]) -> list[dict]:
    """
    Convert validated ship placement input into internal board state.

    Returns a list of ship state dicts.
    """
    board_ships = []
    for ship in ships_input:
        name = ship["name"]
        size = SHIPS[name]
        placement_type = ship.get("placement_type", "classical")

        pos_a = compute_positions(
            ship["x_a"], ship["y_a"], size, ship["orientation_a"]
        )
        pos_b = None
        if placement_type == "superposition":
            pos_b = compute_positions(
                ship["x_b"], ship["y_b"], size, ship["orientation_b"]
            )

        board_ships.append({
            "name": name,
            "size": size,
            "placement_type": placement_type,
            "positions_a": pos_a,
            "positions_b": pos_b,
            "collapsed": placement_type == "classical",
            "collapsed_to": "a" if placement_type == "classical" else None,
            "hits": [False] * size,
            "sunk": False,
        })

    return board_ships


# ── Attack Processing ─────────────────────────────────────────────────────

def process_attack(
    board_ships: list[dict],
    x: int,
    y: int,
) -> dict:
    """
    Process an attack at coordinate (x, y) against a player's board.

    If the coordinate is part of a superposed ship, the quantum circuit
    fires and collapses the wave function.

    Returns:
        {
            "result": "miss" | "hit" | "quantum_ghost" | "sunk",
            "ship_name": str | None,
            "collapsed": bool,         — whether a collapse happened
            "collapsed_to": "a"|"b"|None,
            "sunk_ship": str | None,
        }
    """
    coord = [x, y]

    for ship in board_ships:
        if ship["sunk"]:
            continue

        if not ship["collapsed"]:
            # ── Superposed ship ──────────────────────────────────
            in_a = coord in ship["positions_a"]
            in_b = coord in ship["positions_b"]

            if not in_a and not in_b:
                continue  # This shot doesn't interact with this ship

            # Fire the quantum circuit! 🎲
            collapse_result = collapse_superposition()
            ship["collapsed"] = True
            ship["collapsed_to"] = collapse_result

            # Determine which positions the ship actually occupies
            actual_positions = (
                ship["positions_a"] if collapse_result == "a"
                else ship["positions_b"]
            )

            if coord in actual_positions:
                # Hit! The ship collapsed HERE
                idx = actual_positions.index(coord)
                ship["hits"][idx] = True
                ship["sunk"] = all(ship["hits"])

                return {
                    "result": "sunk" if ship["sunk"] else "hit",
                    "ship_name": ship["name"],
                    "collapsed": True,
                    "collapsed_to": collapse_result,
                    "sunk_ship": ship["name"] if ship["sunk"] else None,
                }
            else:
                # Quantum Ghost — the ship is NOT here, it collapsed
                # to the other position
                return {
                    "result": "quantum_ghost",
                    "ship_name": ship["name"],
                    "collapsed": True,
                    "collapsed_to": collapse_result,
                    "sunk_ship": None,
                }

        else:
            # ── Already collapsed (classical or previously observed) ──
            actual_positions = (
                ship["positions_a"] if ship["collapsed_to"] == "a"
                else ship["positions_b"]
            )
            if coord in actual_positions:
                idx = actual_positions.index(coord)
                if ship["hits"][idx]:
                    # Already hit this cell — treat as a miss (wasted shot)
                    return {
                        "result": "miss",
                        "ship_name": None,
                        "collapsed": False,
                        "collapsed_to": None,
                        "sunk_ship": None,
                    }
                ship["hits"][idx] = True
                ship["sunk"] = all(ship["hits"])
                return {
                    "result": "sunk" if ship["sunk"] else "hit",
                    "ship_name": ship["name"],
                    "collapsed": False,
                    "collapsed_to": ship["collapsed_to"],
                    "sunk_ship": ship["name"] if ship["sunk"] else None,
                }

    # No ship at this coordinate
    return {
        "result": "miss",
        "ship_name": None,
        "collapsed": False,
        "collapsed_to": None,
        "sunk_ship": None,
    }


def is_all_sunk(board_ships: list[dict]) -> bool:
    """Check if every ship on the board has been sunk."""
    return all(ship["sunk"] for ship in board_ships)
