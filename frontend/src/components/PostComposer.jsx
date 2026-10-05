import React, { useEffect, useRef, useState } from 'react';
import api from '../api';

export default function PostComposer({ onPosted }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  function chooseImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return setError('Choose a JPG, PNG, or WebP image.');
    }
    if (file.size > 5 * 1024 * 1024) return setError('The photo must be at most 5 MB.');
    setImage(file);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('title', title.trim());
      body.append('content', content);
      if (image) body.append('image', image);
      const response = await api.post('/posts', body);
      setTitle(''); setContent(''); setImage(null);
      onPosted?.(response.data.post);
    } catch (error) {
      setError(error.response?.data?.error || 'Could not publish your thread. Please try again.');
    } finally { setBusy(false); }
  }
  return <form className="new-post" onSubmit={submit} aria-label="Create a thread">
    <input className="thread-title-input" aria-label="Thread title" placeholder="Start a thread: add a title"
      maxLength={200} required value={title} onChange={event => setTitle(event.target.value)} disabled={busy} />
    <textarea aria-label="Thread text" maxLength={5000} placeholder="Share a story, ask a question, or add a photo..."
      value={content} onChange={event => setContent(event.target.value)} disabled={busy} />
    {preview && <div className="attachment-preview">
      <img src={preview} alt="Selected photo" />
      <button type="button" disabled={busy} onClick={() => setImage(null)}>Remove photo</button>
    </div>}
    <div className="new-post-actions">
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} hidden />
      <button type="button" className="secondary-button" disabled={busy} onClick={() => fileInput.current?.click()}>Add photo</button>
      <button type="submit" disabled={busy || !title.trim()}>{busy ? 'Publishing...' : 'Publish thread'}</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
