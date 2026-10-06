import React, { useEffect, useRef, useState } from 'react';
import api, { API_ORIGIN } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import LocalTime from '../components/LocalTime.jsx';
import VerifiedBadge from '../components/VerifiedBadge.jsx';
import ProtectedImage from '../components/ProtectedImage.jsx';

const sections = ['threads', 'comments', 'users', 'history'];
const labels = { threads: 'Threads', comments: 'Comments', users: 'Accounts', history: 'History' };
export default function Admin() {
  const { user, setUser } = useAuth();
  const [section, setSection] = useState('threads');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [changing, setChanging] = useState(null);
  const [pending, setPending] = useState(null);
  const [reason, setReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const request = useRef(0);
  const dialog = useRef(null);
  function failure(error, fallback) {
    if (error.response?.status === 403) setUser(current => current ? { ...current, role: 'member' } : current);
    setError(error.response?.data?.error || fallback);
  }
  useEffect(() => {
    let active = true;
    const id = ++request.current;
    setLoading(true); setError('');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/admin/' + section, { params: { page, q: query }, signal: controller.signal });
        if (active && id === request.current) {
          setRows(response.data[section === 'history' ? 'actions' : section]); setTotal(response.data.total);
        }
      } catch (error) { if (active && id === request.current) failure(error, 'Could not load administration. Try again.'); }
      finally { if (active && id === request.current) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [section, query, page, refresh]);
  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
    if (!pending && dialog.current?.open) dialog.current.close();
  }, [pending]);
  function choose(value) { setSection(value); setPage(1); setQuery(''); setNotice(''); }
  async function verify(account) {
    if (changing) return;
    setChanging(account.id); setError(''); setNotice('');
    try {
      const response = await api.put('/admin/users/' + account.id + '/verification', { verified: !account.is_verified });
      setRows(current => current.map(row => row.id === account.id ? { ...row, is_verified: response.data.user.is_verified } : row));
      if (account.id === user.id) setUser(current => current?.id === account.id ? { ...current, is_verified: response.data.user.is_verified } : current);
      setNotice(response.data.user.is_verified ? 'Verified badge added to ' + account.username + '.' : 'Verified badge removed from ' + account.username + '.');
    } catch (error) { failure(error, 'Could not update this badge.'); }
    finally { setChanging(null); }
  }
  async function remove(event) {
    event.preventDefault();
    if (!pending || removing || !reason.trim()) return;
    setRemoving(true); setError(''); setNotice('');
    try {
      await api.delete('/admin/' + pending.kind + '/' + pending.id, { data: { reason } });
      setPending(null); setNotice(pending.kind === 'threads' ? 'Thread removed.' : 'Comment and its replies removed.');
      if (rows.length === 1 && page > 1) setPage(current => current - 1);
      else setRefresh(current => current + 1);
    } catch (error) { failure(error, 'Could not remove this content.'); }
    finally { setRemoving(false); }
  }
  function startRemoval(kind, row) { setError(''); setReason(''); setPending({ kind, id: row.id, title: row.title || row.content?.slice(0, 80) || 'Untitled thread' }); }
  return <div className="admin-page">
    <header className="page-heading"><span className="eyebrow">Site management</span><h1>Administration</h1>
      <p>Moderate conversations and manage verified accounts.</p></header>
    <div className="admin-tabs" role="tablist" aria-label="Admin sections">
      {sections.map((value, index) => <button type="button" role="tab" key={value} aria-selected={section === value}
        aria-controls="admin-results" onClick={() => choose(value)} onKeyDown={event => {
          let next;
          if (event.key === 'ArrowRight') next = (index + 1) % sections.length;
          if (event.key === 'ArrowLeft') next = (index + sections.length - 1) % sections.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = sections.length - 1;
          if (next !== undefined) { event.preventDefault(); choose(sections[next]); event.currentTarget.parentElement.children[next].focus(); }
        }} tabIndex={section === value ? 0 : -1}>{labels[value]}</button>)}
    </div>
    {section === 'users' && <p className="admin-note">A verified badge is assigned by Connectly. It does not grant administrator access.</p>}
    <div className="admin-toolbar">
      {section !== 'history' && <input aria-label={'Search ' + labels[section].toLowerCase()} value={query} maxLength={100}
        placeholder={section === 'users' ? 'Search username...' : 'Search content or username...'}
        onChange={event => { setQuery(event.target.value); setPage(1); }} />}
      <button type="button" className="secondary-button" disabled={loading} onClick={() => setRefresh(current => current + 1)}><Icon name="refresh" size={16} />Refresh</button>
    </div>
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <section id="admin-results" role="tabpanel" aria-label={labels[section]} aria-busy={loading}>
      {loading ? <p className="muted" role="status">Loading...</p> : error ? null : !rows.length ? <p className="admin-empty">No {section === 'users' ? 'accounts' : section === 'history' ? 'actions' : section} found.</p> :
        rows.map(row => section === 'users' ? <article className="admin-row admin-user-row" key={row.id} aria-label={'Account ' + row.username}>
          <Avatar url={row.avatar_url} username={row.username} />
          <div className="admin-user-details"><h2>{row.username}<VerifiedBadge verified={row.is_verified} /></h2>
            <small>ID {row.id} · {row.role === 'admin' ? 'Administrator' : 'Member'}</small></div>
          <button type="button" className="secondary-button" disabled={changing !== null}
            onClick={() => verify(row)}>{changing === row.id ? 'Saving...' : row.is_verified ? 'Remove badge' : 'Verify account'}</button>
        </article> : section === 'history' ? <article className="admin-row" key={row.id}>
          <div className="admin-meta"><strong>{row.actor_name || 'Former administrator'}</strong><LocalTime value={row.created_at} /></div>
          <h2>{row.action === 'verification' ? 'Verification updated' : row.action === 'remove_comment' ? 'Comment removed' : 'Thread removed'}</h2>
          <p>{row.target_label}</p><p className="muted">{row.details} · ID {row.target_id}</p>
        </article> : <article className="admin-row" key={row.id} aria-label={(section === 'threads' ? 'Thread ' : 'Comment ') + row.id}>
          <div className="admin-meta"><strong>{row.username}</strong><VerifiedBadge verified={row.is_verified} /><LocalTime value={row.created_at} />
            <span>ID {row.id}{section === 'comments' ? ' · Thread ' + row.post_id : ''}</span>
            {row.profile_visibility === 'private' && <span className="admin-badge-tag">Private profile</span>}</div>
          {section === 'threads' && <h2>{row.title || 'Untitled thread'}</h2>}
          {row.content && <p>{row.content}</p>}
          {section === 'threads' && row.image_url && (row.image_private ? <ProtectedImage className="admin-photo" src={row.image_url} alt={'Photo in thread ' + row.id} />
            : <img className="admin-photo" src={row.image_url.startsWith('https://') ? row.image_url : API_ORIGIN + row.image_url} alt={'Photo in thread ' + row.id} />)}
          <button type="button" className="secondary-button danger" onClick={() => startRemoval(section, row)}>
            {section === 'threads' ? 'Remove thread' : 'Remove comment'}</button>
        </article>)}
    </section>
    {!loading && !error && total > 20 && <div className="admin-pagination">
      <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Previous</button>
      <span>Page {page} of {Math.ceil(total / 20)}</span>
      <button className="secondary-button" type="button" disabled={page * 20 >= total} onClick={() => setPage(current => current + 1)}>Next</button></div>}
    <dialog className="admin-dialog" ref={dialog} aria-labelledby="admin-remove-title" onCancel={event => {
      if (removing) event.preventDefault(); else setPending(null);
    }}>
      <form onSubmit={remove}><h2 id="admin-remove-title">{pending?.kind === 'comments' ? 'Remove comment?' : 'Remove thread?'}</h2>
        <p>{pending?.title}</p>
        <p>{pending?.kind === 'comments' ? 'This also removes replies beneath this comment.' : 'This removes the thread, its photo, replies, votes and saved references.'} This cannot be undone.</p>
        <label>Removal reason<textarea autoFocus required maxLength={300} value={reason} disabled={removing} onChange={event => setReason(event.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="admin-dialog-actions"><button type="button" className="secondary-button" disabled={removing} onClick={() => setPending(null)}>Cancel</button>
          <button type="submit" className="primary-button" disabled={removing || !reason.trim()}>{removing ? 'Removing...' : 'Confirm removal'}</button></div></form>
    </dialog>
  </div>;
}
