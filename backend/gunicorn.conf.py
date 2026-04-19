import multiprocessing
import os

# ── Server Socket ─────────────────────────────────────────────────────────

bind = "127.0.0.1:3030"
backlog = 2048

# ── Worker Processes ──────────────────────────────────────────────────────

# Since we use Flask-SocketIO with eventlet, we MUST use the eventlet worker.
# Multiple workers for Socket.IO require a sticky session/load balancer and a message queue (like Redis).
# For now, we use 1 worker to keep it simple and stable.
worker_class = "eventlet"
workers = 1
threads = 1
timeout = 30
keepalive = 2

# ── Logging ───────────────────────────────────────────────────────────────

accesslog = "access.log"
errorlog = "error.log"
loglevel = "info"
capture_output = True

# ── Process Naming ────────────────────────────────────────────────────────

proc_name = "quantum_battleship_backend"
