import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(emailOrUsername, password);
      navigate('/');
    } catch (err) {
      if (!err.response) {
        setError('Cannot reach the server. Please try again shortly.');
      } else if (err.response.status === 429) {
        setError(err.response.data?.error || 'Too many login attempts. Try again in 15 minutes.');
      } else {
        setError(err.response.data?.error || `Login failed (HTTP ${err.response.status}).`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout><div className="auth-form">
      <span className="eyebrow">WELCOME BACK</span>
      <h1>Log in to Connectly</h1>
      <p className="auth-intro">Pick up where the conversation left off.</p>
      <form onSubmit={submit}>
        <input
          placeholder="Email or username"
          aria-label="Email or username"
          autoComplete="username"
          value={emailOrUsername}
          onChange={e => setEmailOrUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
      </form>
      <p><Link to="/forgot-password">Forgot password?</Link></p>
      <p>No account? <Link to="/signup">Sign up</Link></p>
    </div></AuthLayout>
  );
}
