import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import Avatar from './Avatar.jsx';

export default function UserSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  function clear() {
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  useEffect(() => { clear(); }, [location.pathname]);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); setStatus('idle'); return; }
    let active = true;
    const controller = new AbortController();
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/users', { params: { q: term }, signal: controller.signal });
        if (active) { setResults(res.data.users); setStatus('ready'); }
      } catch {
        if (active) { setResults([]); setStatus('error'); }
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    const onOutsideClick = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutsideClick);
    return () => document.removeEventListener('pointerdown', onOutsideClick);
  }, []);

  function onKeyDown(event) {
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' && open && status === 'ready' && results.length) {
      event.preventDefault();
      navigate(`/profile/${results[0].username}`);
      clear();
    }
  }

  return (
    <div className="user-search" ref={rootRef}>
      <input
        aria-label="Search users"
        placeholder="Search users..."
        autoComplete="off"
        maxLength={50}
        value={query}
        onChange={event => { setQuery(event.target.value); setResults([]); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && query.trim() && (
        <div className="user-search-results" aria-live="polite">
          {status === 'loading' && <p className="muted">Searching...</p>}
          {status === 'error' && <p className="muted">Search is unavailable right now.</p>}
          {status === 'ready' && !results.length && <p className="muted">No users found.</p>}
          {status === 'ready' && results.map(user => (
            <Link key={user.id} to={`/profile/${user.username}`} onClick={clear}
              className="user-search-result">
              <Avatar url={user.avatar_url} username={user.username} className="search-avatar" />
              <span>{user.username}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
