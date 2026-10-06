import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { API_ORIGIN } from '../api';
import CommentSection from './CommentSection.jsx';
import Avatar from './Avatar.jsx';
import LocalTime from './LocalTime.jsx';
import ProtectedImage from './ProtectedImage.jsx';
import Icon from './Icon.jsx';
import Poll from './Poll.jsx';

export default function PostCard({ post, onDelete, onBookmarkChange, expanded = false }) {
  const [saved, setSaved] = useState(!!post.savedByMe);
  const [saveBusy, setSaveBusy] = useState(false);
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
  useEffect(() => setSaved(!!post.savedByMe), [post.id, post.savedByMe]);
  async function toggleSave() {
    if (saveBusy) return;
    setSaveBusy(true); setActionError('');
    try {
      const response = saved ? await api.delete('/posts/' + post.id + '/bookmark') : await api.post('/posts/' + post.id + '/bookmark');
      setSaved(response.data.saved); onBookmarkChange?.(response.data.saved, post.id);
    } catch (error) { setActionError(error.response?.data?.error || 'Could not save this thread. Try again.'); }
    finally { setSaveBusy(false); }
  }

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
    <article className="post-card">
      <div className="post-header">
        <Link to={`/profile/${post.author.username}`} className="post-author">
          <Avatar url={post.author.avatar_url} username={post.author.username} className="post-avatar" />
          <span>{post.author.username}</span>
        </Link>
        <span className="post-meta"><LocalTime className="post-date" value={post.created_at} /><span className="thread-tag">{post.poll ? 'Poll' : post.image_url ? 'Photo' : 'Thread'}</span></span>
      </div>
      <h2 className="post-title"><Link to={'/threads/' + post.id}>{post.title || post.content?.slice(0, 100) || 'Photo thread'}</Link></h2>
      {post.content && <p className="post-content">{post.content}</p>}
      {post.image_url && (post.image_private
        ? <ProtectedImage className="post-image" src={post.image_url} alt={'Photo posted by ' + post.author.username} />
        : <img className="post-image" src={post.image_url.startsWith('https://') ? post.image_url : API_ORIGIN + post.image_url} alt={'Photo posted by ' + post.author.username} />)}
      {post.poll && <Poll postId={post.id} poll={post.poll} />}
      <div className="post-actions">
        <button className={liked ? 'liked' : ''} onClick={toggleLike} disabled={busy} aria-pressed={liked}>
          <Icon name="up" size={17} />{likeCount}<span>{liked ? 'Upvoted' : 'Upvote'}</span>
        </button>
        <button onClick={() => setShowComments(s => !s)} aria-label={'Discussion, ' + commentCount + ' comments'}>
          <Icon name="message" size={17} />{commentCount}<span>Replies</span>
        </button>
        {!expanded && <Link className="thread-link" to={'/threads/' + post.id}>Open thread<Icon name="arrow" size={16} /></Link>}
        <button type="button" className={'save-thread' + (saved ? ' saved' : '')} aria-label={saved ? 'Unsave thread' : 'Save thread'}
          aria-pressed={saved} disabled={saveBusy} onClick={toggleSave}><Icon name="bookmark" size={17} /><span>{saved ? 'Saved' : 'Save'}</span></button>
        {onDelete && <button onClick={handleDelete} className="danger">Delete</button>}
      </div>
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {showComments && <CommentSection postId={post.id} onCreated={() => setCommentCount(count => count + 1)} />}
    </article>
  );
}
