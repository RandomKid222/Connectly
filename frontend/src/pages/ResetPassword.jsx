import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function ResetPassword() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { logout } = useAuth();

  useEffect(() => {
    // Remove the secret from the address bar and browser history after reading it.
    if (token) window.history.replaceState(window.history.state, '', '/reset-password');
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      logout();
      setSuccess(true);
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset your password. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form">
      <h1>Set a new password</h1>
      {success ? <p role="status">Password updated. <Link to="/login">Log in</Link> with your new password.</p> :
        token ? <form onSubmit={submit}>
          <input type="password" aria-label="New password" autoComplete="new-password"
            placeholder="New password (12+ characters)" value={password}
            onChange={e => setPassword(e.target.value)} minLength={12} maxLength={128} required />
          <input type="password" aria-label="Confirm new password" autoComplete="new-password"
            placeholder="Confirm new password" value={confirm}
            onChange={e => setConfirm(e.target.value)} minLength={12} maxLength={128} required />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Updating...' : 'Update password'}</button>
        </form> : <p>Missing reset link. <Link to="/forgot-password">Request another link</Link>.</p>}
      <p><Link to="/forgot-password">Request a new link</Link></p>
    </div>
  );
}
