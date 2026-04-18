"""Centralized configuration loaded from environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Supabase ──────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# ── Flask ─────────────────────────────────────────────────────────────────
FLASK_SECRET = os.getenv("FLASK_SECRET", "quantum-battleship-dev-secret")
FLASK_PORT = int(os.getenv("FLASK_PORT", "3030"))
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"

# ── CORS ──────────────────────────────────────────────────────────────────
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
