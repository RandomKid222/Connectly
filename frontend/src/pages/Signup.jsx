import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signup(username, email, password);
      navigate('/');
    } catch (err) {
      if (!err.response) {
        setError('Cannot reach the server. Please try again shortly.');
      } else if (err.response.status === 404) {
        setError('Account creation is unavailable right now. Please try again shortly.');
      } else {
        setError(err.response.data?.error || `Signup failed (HTTP ${err.response.status}).`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout><div className="auth-form">
      <span className="eyebrow">YOUR NEXT CONVERSATION AWAITS</span>
      <h1>Join Connectly</h1>
      <p className="auth-intro">A small step toward finding your people.</p>
      <form onSubmit={submit}>
        <input
          placeholder="Username"
          aria-label="Username"
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9_]{3,30}"
          title="3–30 letters, numbers, or underscores"
          required
        />
        <input
          type="email"
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          maxLength={254}
          required
        />
        <input
          type="password"
          placeholder="Password (at least 12 characters)"
          aria-label="Password (at least 12 characters)"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={12}
          maxLength={128}
          required
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Creating account...' : 'Sign up'}</button>
      </form>
      <p>Already have an account? <Link to="/login">Log in</Link></p>
    </div></AuthLayout>
  );
}
