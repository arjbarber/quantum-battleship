"""
Database Utilities — Helper functions for updating Supabase records.
"""

def update_player_stats(supabase, user_id, won: bool):
    """Increment matches_played and optionally matches_won in the profiles table."""
    if not user_id:
        return

    try:
        # Fetch current stats
        # Note: In a production environment with high concurrency, 
        # using a stored procedure (RPC) would be safer than read-then-write.
        profile = supabase.table("profiles").select("matches_played, matches_won").eq("id", user_id).single().execute()
        
        if not profile.data:
            print(f"[DB] Error: Profile not found for {user_id}")
            return

        new_played = (profile.data.get("matches_played") or 0) + 1
        new_won = (profile.data.get("matches_won") or 0) + (1 if won else 0)

        supabase.table("profiles").update({
            "matches_played": new_played,
            "matches_won": new_won
        }).eq("id", user_id).execute()
        
        print(f"[DB] Updated stats for {user_id}: Played={new_played}, Won={new_won}")
    except Exception as e:
        print(f"[DB] Error updating player stats: {str(e)}")

def complete_game_record(supabase, game_id, winner_id):
    """Mark a game as completed and set the winner."""
    if not game_id:
        return

    try:
        supabase.table("games").update({
            "status": "completed",
            "winner_id": winner_id,
        }).eq("id", game_id).execute()
        print(f"[DB] Game {game_id} marked as completed. Winner: {winner_id}")
    except Exception as e:
        print(f"[DB] Error completing game record: {str(e)}")
