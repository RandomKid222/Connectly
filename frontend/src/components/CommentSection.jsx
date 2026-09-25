import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import Avatar from './Avatar.jsx';

export default function CommentSection({ postId }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const commentMutation = useRef(0);
  const sectionRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    setLoading(true);
    setComments([]);
    const refresh = async (initial = false) => {
      if (busy) return;
      busy = true;
      const version = commentMutation.current;
      try {
        const res = await api.get(`/posts/${postId}/comments`);
        if (!cancelled && version === commentMutation.current) {
          setComments(res.data.comments);
          setError('');
        }
      } catch {
        if (!cancelled && initial) setError('Could not load comments.');
      } finally {
        busy = false;
        if (!cancelled && initial) setLoading(false);
      }
    };
    refresh(true);
    const onVisible = () => {
      const rect = sectionRef.current?.getBoundingClientRect();
      if (document.visibilityState === 'visible' && rect &&
          rect.bottom >= 0 && rect.top <= window.innerHeight) refresh();
    };
    const timer = setInterval(onVisible, 30000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [postId]);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const res = await api.post(`/posts/${postId}/comments`, { content: text });
      commentMutation.current += 1;
      setComments(current => [...current, res.data.comment]);
      setText('');
      setError('');
    } catch {
      setError('Could not post your comment. Please try again.');
    }
  }

  return (
    <div className="comment-section" ref={sectionRef}>
      {loading ? (
        <p className="muted">Loading comments...</p>
      ) : (
        comments.map(c => (
          <div key={c.id} className="comment">
            <Avatar url={c.avatar_url} username={c.username} className="comment-avatar" />
            <span className="comment-body"><span className="comment-author">{c.username}</span>
              <span>{c.content}</span></span>
          </div>
        ))
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={submit} className="comment-form">
        <input
          maxLength={5000}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write a comment..."
        />
        <button type="submit">Post</button>
      </form>
    </div>
  );
}
