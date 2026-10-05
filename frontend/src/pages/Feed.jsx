import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import PostComposer from '../components/PostComposer.jsx';

export default function Feed() {
  const { user } = useAuth();
  const [tab, setTab] = useState('feed');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mutation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    setLoading(true); setPosts([]); setError('');
    const refresh = async (initial = false) => {
      if (busy) return;
      busy = true;
      const version = mutation.current;
      try {
        const response = await api.get(tab === 'feed' ? '/posts/feed' : '/posts/explore');
        if (!cancelled && version === mutation.current) { setPosts(response.data.posts); setError(''); }
      } catch { if (!cancelled && initial) setError('Could not load threads. Please try again shortly.'); }
      finally { busy = false; if (!cancelled && initial) setLoading(false); }
    };
    refresh(true);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(onVisible, 30000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true; clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tab]);
  function posted(post) {
    mutation.current += 1;
    setPosts(current => [post, ...current.filter(item => item.id !== post.id)]);
  }
  function deleted(id) {
    mutation.current += 1;
    setPosts(current => current.filter(post => post.id !== id));
  }
  return <div className="feed">
    <PostComposer onPosted={posted} />
    <div className="tabs">
      <button type="button" className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>Following</button>
      <button type="button" className={tab === 'explore' ? 'active' : ''} onClick={() => setTab('explore')}>Explore</button>
    </div>
    {loading ? <p className="muted">Loading threads...</p> : error && !posts.length ? <p className="error" role="alert">{error}</p>
      : !posts.length ? <p className="muted">{tab === 'feed' ? 'No threads yet. Follow people or check Explore.' : 'No threads yet.'}</p>
      : posts.map(post => <PostCard key={post.id} post={post} onDelete={post.author.id === user.id ? deleted : undefined} />)}
  </div>;
}
