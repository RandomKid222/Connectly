import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { API_ORIGIN } from '../api';
import CommentSection from './CommentSection.jsx';

export default function PostCard({ post, onDelete }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [showComments, setShowComments] = useState(false);

  async function toggleLike() {
    if (liked) {
      await api.delete(`/posts/${post.id}/like`);
      setLiked(false);
      setLikeCount(c => c - 1);
    } else {
      await api.post(`/posts/${post.id}/like`);
      setLiked(true);
      setLikeCount(c => c + 1);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this post?')) return;
    await api.delete(`/posts/${post.id}`);
    onDelete?.(post.id);
  }

  return (
    <div className="post-card">
      <div className="post-header">
        <Link to={`/profile/${post.author.username}`} className="post-author">
          {post.author.username}
        </Link>
        <span className="post-date">{new Date(post.created_at).toLocaleString()}</span>
      </div>
      {post.content && <p className="post-content">{post.content}</p>}
      {post.image_url && <img className="post-image" src={post.image_url.startsWith('https://') ? post.image_url : API_ORIGIN + post.image_url} alt="" />}
      <div className="post-actions">
        <button className={liked ? 'liked' : ''} onClick={toggleLike}>
          {liked ? '♥' : '♡'} {likeCount}
        </button>
        <button onClick={() => setShowComments(s => !s)}>
          💬 {post.commentCount}
        </button>
        {onDelete && <button onClick={handleDelete} className="danger">Delete</button>}
      </div>
      {showComments && <CommentSection postId={post.id} />}
    </div>
  );
}
