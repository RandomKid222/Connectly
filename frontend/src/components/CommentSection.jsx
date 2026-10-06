import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import Avatar from './Avatar.jsx';
import LocalTime from './LocalTime.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';

export default function CommentSection({ postId, onCreated }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [reply, setReply] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const mutation = useRef(0);
  const section = useRef(null);
  const input = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    setLoading(true); setComments([]); setReply(null); setError('');
    const refresh = async (initial = false) => {
      if (busy) return;
      busy = true;
      const version = mutation.current;
      try {
        const response = await api.get('/posts/' + postId + '/comments');
        if (!cancelled && version === mutation.current) { setComments(response.data.comments); setError(''); }
      } catch { if (!cancelled) setError('Could not load this discussion.'); }
      finally { busy = false; if (!cancelled && initial) setLoading(false); }
    };
    refresh(true);
    const onVisible = () => {
      const rect = section.current?.getBoundingClientRect();
      if (document.visibilityState === 'visible' && rect && rect.bottom >= 0 && rect.top <= window.innerHeight) refresh();
    };
    const timer = setInterval(onVisible, 30000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [postId]);
  const roots = useMemo(() => {
    const nodes = new Map(comments.map(comment => [comment.id, { ...comment, children: [] }]));
    const result = [];
    for (const comment of nodes.values()) {
      const parent = nodes.get(comment.parent_id);
      if (parent && parent.id !== comment.id) parent.children.push(comment);
      else result.push(comment);
    }
    return result;
  }, [comments]);
  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true); setError('');
    try {
      const response = await api.post('/posts/' + postId + '/comments', { content: text, parent_id: reply?.id || null });
      mutation.current += 1;
      setComments(current => [...current.filter(comment => comment.id !== response.data.comment.id), response.data.comment]);
      onCreated?.();
      setText(''); setReply(null);
    } catch (error) { setError(error.response?.data?.error || 'Could not add your comment. Please try again.'); }
    finally { setSending(false); }
  }
  function renderComment(comment, depth = 0) {
    return <div key={comment.id} className="comment-branch" id={'comment-' + comment.id}>
      <div className="comment">
        <Avatar url={comment.avatar_url} username={comment.username} className="comment-avatar" />
        <div className="comment-body">
          <div className="comment-meta"><Link className="comment-author" to={'/profile/' + comment.username}>{comment.username}<VerifiedBadge verified={comment.is_verified} /></Link>
            <LocalTime value={comment.created_at} className="comment-date" /></div>
          <p>{comment.content}</p>
          {depth < 7 && <button type="button" className="reply-button" onClick={() => {
            setReply({ id: comment.id, username: comment.username }); input.current?.focus();
          }}>Reply</button>}
        </div>
      </div>
      {comment.children.length > 0 && <div className="comment-replies">
        {comment.children.map(child => renderComment(child, depth + 1))}
      </div>}
    </div>;
  }
  return <section className="comment-section" ref={section} aria-label="Discussion">
    <h3>Discussion</h3>
    {loading ? <p className="muted">Loading discussion...</p> : roots.length ? roots.map(comment => renderComment(comment))
      : <p className="muted">No comments yet. Start the discussion.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {reply && <div className="reply-target">Replying to {reply.username}
      <button type="button" onClick={() => setReply(null)}>Cancel reply</button></div>}
    <form onSubmit={submit} className="comment-form">
      <input ref={input} aria-label={reply ? 'Reply text' : 'Comment text'} maxLength={5000} value={text}
        disabled={sending} onChange={event => setText(event.target.value)} placeholder={reply ? 'Write a reply...' : 'Join the discussion...'} />
      <button type="submit" disabled={sending || !text.trim()}>{sending ? 'Sending...' : reply ? 'Reply' : 'Comment'}</button>
    </form>
  </section>;
}
