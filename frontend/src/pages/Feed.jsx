import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import PostComposer from '../components/PostComposer.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

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
  return <div className="content-layout"><div className="feed">
    <header className="page-heading"><span className="eyebrow">THE CONVERSATION STARTS HERE</span>
      <h1>{tab === 'feed' ? 'Your daily catch-up.' : 'A little discovery.'}</h1>
      <p>{tab === 'feed' ? 'Thoughts, photos, and moments from your circle.' : 'Find a new perspective. Meet your next favourite person.'}</p>
    </header>
    <PostComposer onPosted={posted} />
    <div className="feed-toolbar"><div className="tabs" aria-label="Feed view">
      <button type="button" className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>Following</button>
      <button type="button" className={tab === 'explore' ? 'active' : ''} onClick={() => setTab('explore')}>Explore</button>
    </div><span className="toolbar-label">Threads</span></div>
    {loading ? <div className="loading-card" role="status"><span className="loading-line" /><span className="loading-line" /><p className="muted">Loading threads...</p></div> : error && !posts.length ? <p className="error" role="alert">{error}</p>
      : !posts.length ? <div className="empty-state"><span className="empty-icon"><Icon name="message" size={28} /></span>
        <h2>{tab === 'feed' ? 'Make this space yours.' : 'Start the first conversation.'}</h2>
        <p>{tab === 'feed' ? 'Follow people to bring their threads into your feed, or take a look around Explore.' : 'Share a thought or a photo. Someone might have just the reply you need.'}</p>
        {tab === 'feed' && <button type="button" className="secondary-button" onClick={() => setTab('explore')}>Find conversations <Icon name="arrow" size={16} /></button>}
      </div>
      : posts.map(post => <PostCard key={post.id} post={post} onDelete={post.author.id === user.id ? deleted : undefined} />)}
  </div><aside className="feed-aside">
    <section className="welcome-card"><Avatar url={user.avatar_url} username={user.username} className="welcome-avatar" />
      <h2>Hey, {user.username}.</h2><p>There's always room for your perspective.</p>
      <Link to={'/profile/' + user.username}>Visit your space <Icon name="arrow" size={16} /></Link>
    </section>
    <section className="discover-card"><span className="eyebrow">GO A LITTLE FURTHER</span>
      <Icon name="explore" size={34} /><h2>Find your people.</h2>
      <p>A new idea, a shared interest, a conversation that clicks. See what's happening.</p>
      <button type="button" onClick={() => setTab('explore')}>Explore threads <Icon name="arrow" size={16} /></button>
    </section>
    <section className="rail-links"><Link to="/settings"><Icon name="shield" size={17} />Your privacy, your choice</Link>
      <p>Connectly · A place to connect</p></section>
  </aside></div>;
}
