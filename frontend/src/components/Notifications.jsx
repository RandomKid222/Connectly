import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import Avatar from './Avatar.jsx';
import LocalTime from './LocalTime.jsx';

const descriptions = {
  follow: 'followed you', follow_request: 'requested to follow you', like: 'upvoted your thread',
  comment: 'commented on your thread', reply: 'replied to your comment', message: 'sent you a message'
};
export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const container = useRef(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const result = await api.get('/notifications');
      if (id === request.current) {
        setItems(result.data.notifications); setUnread(result.data.unreadCount); setError('');
      }
    } catch { if (id === request.current) setError('Could not load activity. Try again shortly.'); }
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active && document.visibilityState === 'visible') load(); };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const onChanged = () => refresh();
    window.addEventListener('connectly:activity', onChanged);
    return () => {
      active = false; request.current += 1; clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('connectly:activity', onChanged);
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    load();
    const outside = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open, load]);
  async function markRead(id) {
    try { await api.put('/notifications/' + id + '/read'); await load(); }
    catch { setError('Could not update activity.'); }
  }
  async function markAll() {
    if (!items.length || busy) return;
    setBusy(true);
    try { await api.put('/notifications/read', { upToId: items[0].id }); await load(); }
    catch { setError('Could not mark activity as read.'); }
    finally { setBusy(false); }
  }
  async function respond(actor, decision) {
    if (busy) return;
    setBusy(true);
    try { await api.post('/users/' + actor + '/follow-request', { decision }); await load(); }
    catch { setError('Could not update the follow request.'); }
    finally { setBusy(false); }
  }
  return <div className="notifications" ref={container}>
    <button type="button" className="notification-toggle" aria-label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'}
      aria-expanded={open} aria-controls="activity-dropdown" onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section className="activity-dropdown" id="activity-dropdown" aria-label="Recent activity">
      <div className="activity-heading"><strong>Recent activity</strong>
        <button type="button" disabled={!unread || busy} onClick={markAll}>Mark all read</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      {!items.length && !error && <p className="muted">No activity yet.</p>}
      {items.map(item => {
        const target = item.post_id ? '/threads/' + item.post_id :
          item.kind === 'message' ? '/messages/' + item.actor_id : '/profile/' + item.username;
        return <div key={item.id} className={'activity-item' + (!item.read_at ? ' unread' : '')}>
          <Link to={target} onClick={() => { markRead(item.id); setOpen(false); }}>
            <Avatar url={item.avatar_url} username={item.username} />
            <span><span><strong>{item.username}</strong> {descriptions[item.kind] || 'interacted with you'}</span>
              <LocalTime value={item.created_at} className="activity-time" /></span>
          </Link>
          {item.kind === 'follow_request' && !!item.pendingRequest && <div className="request-actions">
            <button type="button" disabled={busy} onClick={() => respond(item.actor_id, 'accept')}>Accept</button>
            <button type="button" disabled={busy} onClick={() => respond(item.actor_id, 'reject')}>Decline</button>
          </div>}
        </div>;
      })}
    </section>}
  </div>;
}
