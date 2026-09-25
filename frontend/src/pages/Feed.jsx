import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Feed() {
  const { user } = useAuth();
  const [tab, setTab] = useState('feed'); // 'feed' | 'explore'
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [loadError, setLoadError] = useState('');
  const postMutation = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    setLoading(true);
    setPosts([]);
    setLoadError('');
    const refresh = async (initial = false) => {
      if (busy) return;
      busy = true;
      const version = postMutation.current;
      try {
        const res = await api.get(tab === 'feed' ? '/posts/feed' : '/posts/explore');
        if (!cancelled && version === postMutation.current) {
          setPosts(res.data.posts);
          setLoadError('');
        }
      } catch {
        if (!cancelled && initial) setLoadError('Could not load posts. Please try again shortly.');
      } finally {
        busy = false;
        if (!cancelled && initial) setLoading(false);
      }
    };
    refresh(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(onVisible, 30000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tab]);

  async function submitPost(e) {
    e.preventDefault();
    if (!content.trim() && !image) return;
    setPostError('');
    setPosting(true);
    try {
      const form = new FormData();
      form.append('content', content);
      if (image) form.append('image', image);
      const res = await api.post('/posts', form);
      postMutation.current += 1;
      setPosts(current => [res.data.post, ...current.filter(post => post.id !== res.data.post.id)]);
      setContent('');
      setImage(null);
      e.target.reset?.();
    } catch (err) {
      setPostError(err.response?.data?.error ||
        (err.response ? `Post failed (HTTP ${err.response.status}).` : 'Could not connect to the server. Please try again.'));
    } finally {
      setPosting(false);
    }
  }

  function chooseImage(e) {
    const file = e.target.files[0];
    setPostError('');
    if (!file) return setImage(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      e.target.value = '';
      setImage(null);
      return setPostError('Choose a JPG, PNG, or WebP image.');
    }
    if (file.size > 5 * 1024 * 1024) {
      e.target.value = '';
      setImage(null);
      return setPostError('The image must be smaller than 5 MB.');
    }
    setImage(file);
  }

  function handleDelete(id) {
    postMutation.current += 1;
    setPosts(current => current.filter(post => post.id !== id));
  }

  return (
    <div className="feed">
      <form className="new-post" onSubmit={submitPost}>
        <textarea
          maxLength={5000}
          placeholder={`What's on your mind, ${user.username}?`}
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        <div className="new-post-actions">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
          <button type="submit" disabled={posting}>{posting ? 'Posting...' : 'Post'}</button>
        </div>
        {postError && <p className="error" role="alert">{postError}</p>}
      </form>

      <div className="tabs">
        <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
          Following
        </button>
        <button className={tab === 'explore' ? 'active' : ''} onClick={() => setTab('explore')}>
          Explore
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading posts...</p>
      ) : loadError && posts.length === 0 ? (
        <p className="error" role="alert">{loadError}</p>
      ) : posts.length === 0 ? (
        <p className="muted">
          {tab === 'feed' ? 'No posts yet — follow people or check Explore.' : 'No posts yet.'}
        </p>
      ) : (
        posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onDelete={post.author.id === user.id ? handleDelete : undefined}
          />
        ))
      )}
    </div>
  );
}
