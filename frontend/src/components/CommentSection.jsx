import React, { useEffect, useState } from 'react';
import api from '../api';

export default function CommentSection({ postId }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/posts/${postId}/comments`)
      .then(res => setComments(res.data.comments))
      .finally(() => setLoading(false));
  }, [postId]);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const res = await api.post(`/posts/${postId}/comments`, { content: text });
    setComments([...comments, res.data.comment]);
    setText('');
  }

  return (
    <div className="comment-section">
      {loading ? (
        <p className="muted">Loading comments...</p>
      ) : (
        comments.map(c => (
          <div key={c.id} className="comment">
            <span className="comment-author">{c.username}</span>
            <span>{c.content}</span>
          </div>
        ))
      )}
      <form onSubmit={submit} className="comment-form">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write a comment..."
        />
        <button type="submit">Post</button>
      </form>
    </div>
  );
}
