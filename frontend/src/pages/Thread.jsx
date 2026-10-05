import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Thread() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let busy = false;
    setLoading(true); setPost(null); setError('');
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await api.get('/posts/' + id);
        if (active) { setPost(result.data.post); setError(''); }
      } catch (error) {
        if (active) {
          if (error.response?.status === 404) setPost(null);
          setError(error.response?.data?.error || 'Could not load this thread. Please try again shortly.');
        }
      } finally { busy = false; if (active) setLoading(false); }
    };
    refresh();
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(visible, 30000);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [id]);
  return <div className="thread-page">
    <Link className="back-link" to="/">← Back to feed</Link>
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p className="muted">Loading thread...</p> : post &&
      <PostCard key={post.id} post={post} expanded onDelete={post.author.id === user.id ? () => navigate('/') : undefined} />}
  </div>;
}
