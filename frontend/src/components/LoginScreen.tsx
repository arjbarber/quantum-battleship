import { useState, useMemo } from 'react';
import './LoginScreen.css';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, username: string) => Promise<void>;
  error?: string | null;
  loading?: boolean;
}

// Generate particle positions deterministically
function generateParticles(count: number) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      left: `${(i * 37.7) % 100}%`,
      delay: `${(i * 1.3) % 8}s`,
      duration: `${8 + (i * 2.1) % 12}s`,
      size: `${3 + (i % 3)}px`,
      isPurple: i % 2 === 0,
    });
  }
  return particles;
}

export default function LoginScreen({ onLogin, onSignup, error, loading }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const particles = useMemo(() => generateParticles(30), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      await onLogin(email, password);
    } else {
      await onSignup(email, password, username);
    }
  };

  return (
    <div className="login-screen">
      {/* Floating Particles */}
      <div className="login-particles">
        {particles.map((p) => (
          <div
            key={p.id}
            className={`particle ${p.isPurple ? 'particle-purple' : 'particle-cyan'}`}
            style={{
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
              width: p.size,
              height: p.size,
            }}
          />
        ))}
      </div>

      {/* Login Card */}
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">⚛️</div>
          <h1 className="login-title">Quantum Battleship</h1>
          <p className="login-subtitle">
            Ships in superposition. Observation collapses reality.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label" htmlFor="username-input">Username</label>
              <input
                id="username-input"
                className="input"
                type="text"
                placeholder="QuantumAdmiral"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="email-input">Email</label>
            <input
              id="email-input"
              className="input"
              type="email"
              placeholder="admiral@quantum.navy"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password-input">Password</label>
            <input
              id="password-input"
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading}
            id="auth-submit"
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? '⏳ Processing...' : mode === 'login' ? '🚀 Enter the Quantum Realm' : '⚛️ Create Account'}
          </button>
        </form>

        <div className="login-toggle">
          <span className="login-toggle-text">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          </span>
          <button
            className="login-toggle-link"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            type="button"
          >
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </div>
      </div>
    </div>
  );
}
