import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { API_ORIGIN } from '../api';
import CommentSection from './CommentSection.jsx';
import Avatar from './Avatar.jsx';
import LocalTime from './LocalTime.jsx';
import ProtectedImage from './ProtectedImage.jsx';

export default function PostCard({ post, onDelete, expanded = false }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [showComments, setShowComments] = useState(expanded);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLiked(post.likedByMe);
    setLikeCount(post.likeCount);
    setCommentCount(post.commentCount);
  }, [post.id, post.likedByMe, post.likeCount, post.commentCount]);

  async function toggleLike() {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
    if (liked) {
      await api.delete(`/posts/${post.id}/like`);
      setLiked(false);
      setLikeCount(c => c - 1);
    } else {
      await api.post(`/posts/${post.id}/like`);
      setLiked(true);
      setLikeCount(c => c + 1);
    }
    } catch { setActionError('Could not update your upvote. Please try again.'); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!confirm('Delete this post?')) return;
    try {
      await api.delete(`/posts/${post.id}`);
      onDelete?.(post.id);
    } catch { setActionError('Could not delete this thread. Please try again.'); }
  }

  return (
    <div className="post-card">
      <div className="post-header">
        <Link to={`/profile/${post.author.username}`} className="post-author">
          <Avatar url={post.author.avatar_url} username={post.author.username} className="post-avatar" />
          <span>{post.author.username}</span>
        </Link>
        <LocalTime className="post-date" value={post.created_at} />
      </div>
      <h2 className="post-title"><Link to={'/threads/' + post.id}>{post.title || post.content?.slice(0, 100) || 'Photo thread'}</Link></h2>
      {post.content && <p className="post-content">{post.content}</p>}
      {post.image_url && (post.image_private
        ? <ProtectedImage className="post-image" src={post.image_url} alt={'Photo posted by ' + post.author.username} />
        : <img className="post-image" src={post.image_url.startsWith('https://') ? post.image_url : API_ORIGIN + post.image_url} alt={'Photo posted by ' + post.author.username} />)}
      <div className="post-actions">
        <button className={liked ? 'liked' : ''} onClick={toggleLike} disabled={busy} aria-pressed={liked}>
          ↑ {likeCount} {liked ? 'Upvoted' : 'Upvote'}
        </button>
        <button onClick={() => setShowComments(s => !s)} aria-label={'Discussion, ' + commentCount + ' comments'}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M21 11a9 9 0 0 1-9 9H4l-3 2 1-6a9 9 0 1 1 19-5Z" />
          </svg> {commentCount}
        </button>
        {!expanded && <Link className="thread-link" to={'/threads/' + post.id}>Open thread</Link>}
        {onDelete && <button onClick={handleDelete} className="danger">Delete</button>}
      </div>
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {showComments && <CommentSection postId={post.id} onCreated={() => setCommentCount(count => count + 1)} />}
    </div>
  );
}
