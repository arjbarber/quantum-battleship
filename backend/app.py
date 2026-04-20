# eventlet monkey-patch MUST come before all other imports
# so that httpx (used by Supabase client) works with eventlet sockets
import eventlet
eventlet.monkey_patch()

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix
from postgrest.exceptions import APIError
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
# x_proto=1: Trust X-Forwarded-Proto (HTTPS)
# x_for=1: Trust X-Forwarded-For (Client IP)
# x_host=1: Trust X-Forwarded-Host
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_for=1, x_host=1)
app.config["SECRET_KEY"] = FLASK_SECRET

# CORS configuration
CORS(app, origins=CORS_ORIGINS, supports_credentials=True)

# Socket.IO with eventlet for async support
socketio = SocketIO(
    app,
    cors_allowed_origins=CORS_ORIGINS,
    async_mode="eventlet",
    manage_session=False,
    logger=True,
    engineio_logger=True,
    ping_timeout=60,
    ping_interval=25
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
    from gotrue.errors import AuthApiError
    
    data = request.get_json()
    email = data.get("email", "")
    password = data.get("password", "")
    username = data.get("username", "")

    if not email or not password or not username:
        return jsonify({"error": "Email, password, and username are required"}), 400

    print(f"[Auth] Attempting signup for: {email} / {username}")

    try:
        # 1. Create user via admin API
        try:
            admin_response = supabase.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"username": username},
            })
            print(f"[Auth] Admin create_user response: {admin_response}")
        except AuthApiError as e:
            # If user already exists, we might get an error here.
            # We check the message to see if we can just proceed to login.
            if "already registered" in e.message.lower() or "already exists" in e.message.lower():
                print(f"[Auth] User already exists, proceeding to login.")
            else:
                print(f"[Auth] Admin create_user error: {e.message} (Status: {e.status})")
                return jsonify({"error": f"Supabase Admin Error: {e.message}"}), e.status
        except Exception as e:
            print(f"[Auth] Unexpected admin create error: {str(e)}")
            return jsonify({"error": f"Unexpected Admin Error: {str(e)}"}), 500

        # 2. Sign in to get session tokens
        try:
            login_response = supabase.auth.sign_in_with_password({
                "email": email,
                "password": password,
            })
            print(f"[Auth] Sign-in response received.")
            
            if login_response.user is None:
                return jsonify({"error": "Login failed after signup. Check credentials."}), 401

            return jsonify({
                "user_id": login_response.user.id,
                "email": email,
                "username": username,
                "session": {
                    "access_token": login_response.session.access_token if login_response.session else None,
                    "refresh_token": login_response.session.refresh_token if login_response.session else None,
                },
            }), 201

        except AuthApiError as e:
            print(f"[Auth] Sign-in error after signup: {e.message} (Status: {e.status})")
            return jsonify({"error": f"Login Error: {e.message}"}), e.status

    except Exception as e:
        print(f"[Auth] General Signup Exception: {str(e)}")
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
        username = ""
        matches_played = 0
        matches_won = 0
        try:
            profile = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
            if profile.data:
                username = profile.data.get("username", "")
                matches_played = profile.data.get("matches_played", 0)
                matches_won = profile.data.get("matches_won", 0)
        except APIError as e:
            print(f"Profile fetch warning: {e.message}")
            # Non-fatal error, use defaults
        except Exception as e:
            print(f"Unexpected profile error: {e}")

        return jsonify({
            "user_id": user_id,
            "email": email,
            "username": username,
            "matches_played": matches_played,
            "matches_won": matches_won,
            "session": {
                "access_token": auth_response.session.access_token,
                "refresh_token": auth_response.session.refresh_token,
            },
        }), 200

    except Exception as e:
        print(f"Login Error: {e}")
        return jsonify({"error": str(e)}), 500


# ── Run ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"🚀 Quantum Battleship server starting on port {FLASK_PORT}")
    print(f"   CORS origins: {CORS_ORIGINS}")
    print(f"   Supabase: {SUPABASE_URL[:40]}...")
    socketio.run(app, host="0.0.0.0", port=FLASK_PORT, debug=FLASK_DEBUG, use_reloader=False)
