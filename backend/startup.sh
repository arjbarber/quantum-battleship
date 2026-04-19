#!/bin/bash

# ── Quantum Battleship Backend Startup Script ──────────────────────────────

set -e

BACKEND_DIR="/root/quantum-battleship/backend"
VENV_BIN="$BACKEND_DIR/.venv/bin"
GUNICORN_CONFIG="$BACKEND_DIR/gunicorn.conf.py"
APP_MODULE="app:app"

echo "🚀 Starting Quantum Battleship Backend Setup..."

# 1. Kill existing Gunicorn processes listening on port 3030
echo "🛑 Stopping existing processes on port 3030..."
fuser -k 3030/tcp || echo "No process found on port 3030."
# Also kill by proc_name if it was already set
pkill -f "gunicorn.*quantum_battleship_backend" || true

# 2. Check Nginx configuration
echo "🔍 Checking Nginx configuration..."
nginx -t

# 3. Reload Nginx
echo "🔄 Reloading Nginx service..."
systemctl reload nginx || service nginx reload

# 4. Start Gunicorn in the background
echo "🛰 Starting Gunicorn with Eventlet workers..."
cd "$BACKEND_DIR"
touch error.log access.log
"$VENV_BIN/gunicorn" -c "$GUNICORN_CONFIG" "$APP_MODULE" --daemon

echo "✅ Backend started successfully!"
echo "📡 Monitoring logs (error.log)..."
sleep 2
tail -n 20 error.log
