import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';

export default function Settings() {
  const { user, setUser } = useAuth();
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  useEffect(() => {
    let active = true;
    api.get('/settings').then(response => { if (active) setSettings(response.data.settings); })
      .catch(() => { if (active) setError('Could not load settings. Please try again shortly.'); });
    return () => { active = false; };
  }, []);
  const change = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  async function save(event) {
    event.preventDefault();
    if (busy || !settings) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const result = await api.put('/settings', settings);
      setSettings(result.data.settings);
      setUser(current => ({ ...current, ...result.data.settings }));
      setMessage('Settings saved.');
    } catch (error) { setError(error.response?.data?.error || 'Could not save settings. Please try again.'); }
    finally { setBusy(false); }
  }
  async function securityAction(action, body) {
    if (securityBusy) return;
    setSecurityBusy(true); setSecurityMessage(''); setSecurityError('');
    try {
      const result = await api.post('/settings/' + action, body);
      localStorage.setItem('token', result.data.token);
      setSecurityMessage(result.data.message);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (error) { setSecurityError(error.response?.data?.error || 'Could not complete the security change.'); }
    finally { setSecurityBusy(false); }
  }
  function password(event) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setSecurityError('The new passwords must match.'); return; }
    securityAction('password', { currentPassword, newPassword });
  }
  async function download() {
    if (exporting) return;
    setExporting(true); setError('');
    try {
      const result = await api.get('/settings/export', { responseType: 'blob' });
      const url = URL.createObjectURL(result.data);
      const link = document.createElement('a');
      link.href = url; link.download = 'connectly-data.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Could not download your data. Please try again.'); }
    finally { setExporting(false); }
  }
  return <div className="settings-page">
    <header className="page-heading"><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>Settings</h1>
      <p>Your space, your preferences. Make Connectly feel like you.</p></header>
    <nav className="settings-nav" aria-label="Settings sections">
      <a href="#appearance"><Icon name="sun" size={16} />Appearance</a>
      <a href="#privacy"><Icon name="lock" size={16} />Privacy</a>
      <a href="#discoverability"><Icon name="eye" size={16} />Discoverability</a>
      <a href="#data-sharing"><Icon name="download" size={16} />Data sharing</a>
      <a href="#security"><Icon name="shield" size={16} />Security</a>
    </nav>
    {error && <p className="error" role="alert">{error}</p>}
    {!settings ? !error && <p className="muted">Loading settings...</p> : <form onSubmit={save}>
      <fieldset className="settings-card" id="appearance" disabled={busy}>
        <legend><Icon name="sun" size={19} />Appearance</legend>
        <div className="theme-options" aria-label="Theme previews">
          {['light', 'dark', 'system'].map(theme => <button key={theme} type="button"
            className={'theme-option ' + (settings.theme === theme ? 'selected' : '')}
            aria-pressed={settings.theme === theme} aria-label={'Use ' + theme + ' theme'} onClick={() => change('theme', theme)}>
            <span className={'theme-preview preview-' + theme} aria-hidden="true"><span /><span /><span /></span>
            <span><Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'monitor'} size={16} />
              {theme === 'system' ? 'Device' : theme === 'light' ? 'Light' : 'Dark'}
              {settings.theme === theme && <Icon name="check" size={15} />}</span>
          </button>)}
        </div>
        <label className="setting-row"><span>Theme<span className="setting-help">Choose your look on this account.</span></span>
          <select aria-label="Theme" value={settings.theme} onChange={event => change('theme', event.target.value)}>
            <option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
      </fieldset>
      <fieldset className="settings-card" id="privacy" disabled={busy}>
        <legend><Icon name="lock" size={19} />Privacy</legend>
        <label className="setting-row"><span>Profile visibility
          <span className="setting-help">Private profiles share their bio and threads with approved followers. Existing followers keep access. Your name and profile photo remain visible.</span></span>
          <select aria-label="Profile visibility" value={settings.profile_visibility} onChange={event => change('profile_visibility', event.target.value)}>
            <option value="public">All members</option><option value="private">Approved followers</option>
          </select>
        </label>
        <p className="setting-help">Accept follow requests from Notifications. Switching back to all members accepts pending requests. Older photo links may work briefly while storage caches update. Downloaded copies cannot be taken back.</p>
        <label className="setting-row"><span>Who can message you<span className="setting-help">This also applies to existing conversations.</span></span>
          <select aria-label="Who can message you" value={settings.message_permission} onChange={event => change('message_permission', event.target.value)}>
            <option value="everyone">All members</option><option value="following">People I follow</option><option value="none">No one</option>
          </select>
        </label>
      </fieldset>
      <fieldset className="settings-card" id="discoverability" disabled={busy}>
        <legend><Icon name="eye" size={19} />Discoverability</legend>
        <label className="setting-row"><span>Appear in user search<span className="setting-help">People with your profile link can still open it, subject to your privacy setting.</span></span>
          <input type="checkbox" checked={settings.searchable} onChange={event => change('searchable', event.target.checked)} /></label>
        <label className="setting-row"><span>Show threads in Explore<span className="setting-help">Your approved followers can still see your threads in their feed.</span></span>
          <input type="checkbox" checked={settings.show_in_explore} onChange={event => change('show_in_explore', event.target.checked)} /></label>
      </fieldset>
      <fieldset className="settings-card" id="data-sharing" disabled={busy}>
        <legend><Icon name="download" size={19} />Data sharing</legend>
        <label className="setting-row"><span>Share my follower and following lists<span className="setting-help">Turn this off to keep the member lists visible only to you. Counts may still appear on your profile.</span></span>
          <input type="checkbox" checked={settings.share_follow_lists} onChange={event => change('share_follow_lists', event.target.checked)} /></label>
        <p className="setting-help">Connectly uses hosting, image storage, and email providers to operate. These controls manage what other members see.</p>
        <button type="button" className="secondary-button" disabled={exporting} onClick={download}>
          {exporting ? 'Preparing...' : 'Download my data'}</button>
        <p className="setting-help">Downloads your account details, text posts, comments, conversations, and follow relationships as JSON. Photo files are not included.</p>
      </fieldset>
      <div className="settings-save"><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save settings'}<Icon name="check" size={17} /></button>
      {message && <p className="success" role="status">{message}</p>}
      </div>
    </form>}
    <section className="settings-card" id="security">
      <h2><Icon name="shield" size={19} />Security</h2>
      <p className="setting-help">Change your password or sign out other sessions. You stay signed in on this device.</p>
      <form className="password-form" onSubmit={password}>
        <label>Current password<input type="password" autoComplete="current-password" required maxLength={128}
          value={currentPassword} disabled={securityBusy} onChange={event => setCurrentPassword(event.target.value)} /></label>
        <label>New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128}
          value={newPassword} disabled={securityBusy} onChange={event => setNewPassword(event.target.value)} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128}
          value={confirmPassword} disabled={securityBusy} onChange={event => setConfirmPassword(event.target.value)} /></label>
        <button className="primary-button" type="submit" disabled={securityBusy}>{securityBusy ? 'Updating...' : 'Change password'}</button>
      </form>
      <button type="button" className="secondary-button" disabled={securityBusy} onClick={() => securityAction('sessions', {})}>Sign out other sessions</button>
      {securityError && <p className="error" role="alert">{securityError}</p>}
      {securityMessage && <p className="success" role="status">{securityMessage}</p>}
    </section>
  </div>;
}
