import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import Icon from '../components/Icon.jsx';

export default function SavedThreads() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  useEffect(() => {
    let active = true; let busy = false;
    const load = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      const started = version.current;
      try { const response = await api.get('/posts/saved'); if (active && started === version.current) { setPosts(response.data.posts); setError(''); } }
      catch { if (active) setError('Could not load your saved threads. Try again shortly.'); }
      finally { busy = false; if (active) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener('focus', load); document.addEventListener('visibilitychange', load);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, []);
  const remove = id => { version.current++; setPosts(current => current.filter(post => post.id !== id)); };
  return <div className="saved-page">
    <header className="page-heading saved-heading"><span className="eyebrow">Only visible to you</span><h1>Saved threads</h1>
      <p>A thread worth revisiting? It's right here. Your saved list is visible only to you.</p><Icon name="bookmark" size={68} /></header>
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p className="muted">Loading your collection…</p> : !posts.length ? <div className="empty-state">
      <Icon name="bookmark" size={34} /><h2>No saved threads yet</h2>
      <p>Use Save on a thread to keep it here. Private threads stay subject to the author's privacy choices.</p>
      <Link className="secondary-button" to="/">Browse your feed <Icon name="arrow" size={16} /></Link>
    </div> : posts.map(post => <PostCard key={post.id} post={post}
      onDelete={post.author.id === user.id ? remove : undefined}
      onBookmarkChange={(saved, id) => { if (!saved) remove(id); }} />)}
  </div>;
}
