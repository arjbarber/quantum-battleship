import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

// ── Types ────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  username: string;
  matchesPlayed: number;
  matchesWon: number;
  accessToken: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, username: string) => Promise<void>;
  logout: () => void;
  updateStats: (played: number, won: number) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Provider ─────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('qb_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('qb_user');
      }
    }
  }, []);

  const persistUser = (u: User) => {
    setUser(u);
    localStorage.setItem('qb_user', JSON.stringify(u));
  };

  const updateStats = useCallback((played: number, won: number) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, matchesPlayed: played, matchesWon: won };
      localStorage.setItem('qb_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }
      persistUser({
        id: data.user_id,
        email: data.email,
        username: data.username,
        matchesPlayed: data.matches_played,
        matchesWon: data.matches_won,
        accessToken: data.session?.access_token || '',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, username: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Signup failed');
      }
      persistUser({
        id: data.user_id,
        email: data.email,
        username: data.username,
        matchesPlayed: 0,
        matchesWon: 0,
        accessToken: data.session?.access_token || '',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('qb_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, signup, logout, updateStats }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
