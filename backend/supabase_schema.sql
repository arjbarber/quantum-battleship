-- ═══════════════════════════════════════════════════════════════════════
-- Quantum Battleship — Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables and policies.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Profiles ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username    TEXT UNIQUE NOT NULL,
    matches_played INTEGER DEFAULT 0,
    matches_won    INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: Anyone can read profiles, only the owner can update theirs
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Allow service role full access (for backend signup flow)
CREATE POLICY "Service role full access on profiles"
    ON public.profiles FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');


-- ── Games ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.games (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_1_id  UUID REFERENCES public.profiles(id),
    player_2_id  UUID REFERENCES public.profiles(id),
    status       TEXT DEFAULT 'waiting_for_player'
                 CHECK (status IN ('waiting_for_player', 'placing', 'in_progress', 'completed')),
    current_turn UUID REFERENCES public.profiles(id),
    winner_id    UUID REFERENCES public.profiles(id),
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game participants can view their games"
    ON public.games FOR SELECT
    USING (auth.uid() = player_1_id OR auth.uid() = player_2_id);

CREATE POLICY "Service role full access on games"
    ON public.games FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');


-- ── Game States (RESTRICTED — prevents cheating) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.game_states (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id     UUID REFERENCES public.games(id) ON DELETE CASCADE,
    player_id   UUID REFERENCES public.profiles(id),
    board_data  JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(game_id, player_id)
);

ALTER TABLE public.game_states ENABLE ROW LEVEL SECURITY;

-- CRITICAL: Players can ONLY read their OWN board data
CREATE POLICY "Players can only read own board data"
    ON public.game_states FOR SELECT
    USING (auth.uid() = player_id);

CREATE POLICY "Service role full access on game_states"
    ON public.game_states FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');


-- ── Moves ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.moves (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id      UUID REFERENCES public.games(id) ON DELETE CASCADE,
    player_id    UUID REFERENCES public.profiles(id),
    coordinate_x INTEGER NOT NULL CHECK (coordinate_x >= 0 AND coordinate_x < 10),
    coordinate_y INTEGER NOT NULL CHECK (coordinate_y >= 0 AND coordinate_y < 10),
    result       TEXT NOT NULL
                 CHECK (result IN ('miss', 'hit', 'quantum_ghost', 'sunk')),
    ship_name    TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;

-- Participants of the game can view moves
CREATE POLICY "Game participants can view moves"
    ON public.moves FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.games g
            WHERE g.id = game_id
            AND (g.player_1_id = auth.uid() OR g.player_2_id = auth.uid())
        )
    );

CREATE POLICY "Service role full access on moves"
    ON public.moves FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');


-- ── Auto-create profile on signup ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'username', 'player_' || LEFT(NEW.id::text, 8))
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
