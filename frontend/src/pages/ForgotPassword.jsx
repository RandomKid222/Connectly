import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send the request. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form">
      <h1>Reset your password</h1>
      <p>Enter the email you used to sign up. If it matches an account, we’ll send a link.</p>
      <form onSubmit={submit}>
        <input type="email" aria-label="Email" autoComplete="email" placeholder="Email address"
          value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required />
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</button>
      </form>
      <p><Link to="/login">Back to login</Link></p>
    </div>
  );
}
