import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

// ── Types ────────────────────────────────────────────────────────────────

interface SocketContextType {
  socket: Socket | null;
  socketId: string | null;
  connected: boolean;
  emit: (event: string, data?: any) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler?: (...args: any[]) => void) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Provider ─────────────────────────────────────────────────────────────

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      setConnected(true);
      setSocketId(socket.id || null);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event: string, handler?: (...args: any[]) => void) => {
    if (handler) {
      socketRef.current?.off(event, handler);
    } else {
      socketRef.current?.removeAllListeners(event);
    }
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, socketId, connected, emit, on, off }}>
      {children}
    </SocketContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useSocket(): SocketContextType {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
