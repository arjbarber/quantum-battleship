"""
Quantum Battleship — Flask Application Entry Point

Initializes Flask, CORS, Socket.IO, and Supabase client.
Registers all WebSocket event handlers and serves on port 3030.
"""

# eventlet monkey-patch MUST come before all other imports
# so that httpx (used by Supabase client) works with eventlet sockets
import eventlet
eventlet.monkey_patch()

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix
from supabase import create_client, Client

from config import (
    FLASK_SECRET,
    FLASK_PORT,
    FLASK_DEBUG,
    CORS_ORIGINS,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
)
from game_state import GameManager
from socket_events import register_events


# ── Flask App ─────────────────────────────────────────────────────────────

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
app.config["SECRET_KEY"] = FLASK_SECRET

# CORS for the Vite dev server
CORS(app, origins=CORS_ORIGINS)

# Socket.IO with eventlet for async support
socketio = SocketIO(
    app,
    cors_allowed_origins=CORS_ORIGINS,
    async_mode="eventlet",
    logger=False,
    engineio_logger=False,
)

# ── Supabase ──────────────────────────────────────────────────────────────

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ── Game State ────────────────────────────────────────────────────────────

game_manager = GameManager()

# ── Register Socket Events ────────────────────────────────────────────────
# Register WebSocket events
register_events(socketio, game_manager, supabase)


# ── REST Endpoints (health + auth) ────────────────────────────────────────

@app.route("/api/health")
def health():
    return {"status": "ok", "game": "Quantum Battleship"}


@app.route("/api/auth/signup", methods=["POST"])
def signup():
    from flask import request, jsonify
    data = request.get_json()
    email = data.get("email", "")
    password = data.get("password", "")
    username = data.get("username", "")

    if not email or not password or not username:
        return jsonify({"error": "Email, password, and username are required"}), 400

    try:
        # Create user via admin API (bypasses email validation, auto-confirms)
        # The trigger 'handle_new_user' in SQL will automatically create the profile row
        # using the 'username' provided in user_metadata.
        admin_response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"username": username},
        })

        # Note: If user already exists, admin_response.user might be None or error might be set
        # supabase-py usually returns an error object or raises an exception depending on version
        # We'll check if user was created or if we can proceed to sign in.
        user_id = None
        if admin_response.user:
            user_id = admin_response.user.id
        
        # Now sign in to get session tokens. 
        # If user creation above failed because they exist, this will still work.
        login_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })

        if login_response.user is None:
            return jsonify({"error": "Signup/Login failed. User may already exist with different credentials."}), 400

        user_id = login_response.user.id

        return jsonify({
            "user_id": user_id,
            "email": email,
            "username": username,
            "session": {
                "access_token": login_response.session.access_token if login_response.session else None,
                "refresh_token": login_response.session.refresh_token if login_response.session else None,
            },
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth/login", methods=["POST"])
def login():
    from flask import request, jsonify
    data = request.get_json()
    email = data.get("email", "")
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    try:
        auth_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })

        if auth_response.user is None:
            return jsonify({"error": "Invalid credentials"}), 401

        user_id = auth_response.user.id

        # Fetch profile
        profile = supabase.table("profiles").select("*").eq(
            "id", user_id
        ).single().execute()

        return jsonify({
            "user_id": user_id,
            "email": email,
            "username": profile.data.get("username", ""),
            "matches_played": profile.data.get("matches_played", 0),
            "matches_won": profile.data.get("matches_won", 0),
            "session": {
                "access_token": auth_response.session.access_token,
                "refresh_token": auth_response.session.refresh_token,
            },
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Run ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"🚀 Quantum Battleship server starting on port {FLASK_PORT}")
    print(f"   CORS origins: {CORS_ORIGINS}")
    print(f"   Supabase: {SUPABASE_URL[:40]}...")
    socketio.run(app, host="0.0.0.0", port=FLASK_PORT, debug=FLASK_DEBUG, use_reloader=False)
