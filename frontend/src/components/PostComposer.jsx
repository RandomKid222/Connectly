import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

export default function PostComposer({ onPosted, pollPrompt = 0 }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollEnabled, setPollEnabled] = useState(false);
  const [options, setOptions] = useState(['', '']);
  const titleInput = useRef(null);
  const fileInput = useRef(null);
  useEffect(() => { if (pollPrompt) { setPollEnabled(true); titleInput.current?.focus(); } }, [pollPrompt]);
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
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Choose a JPG, PNG, or WebP image.');
    if (file.size > 5 * 1024 * 1024) return setError('The photo must be at most 5 MB.');
    setImage(file);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    if (pollEnabled && (options.some(option => !option.trim()) ||
        new Set(options.map(option => option.trim().toLowerCase())).size !== options.length)) {
      setError('Give each poll choice a different answer.'); return;
    }
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('title', title.trim());
      body.append('content', content);
      if (pollEnabled) body.append('pollOptions', JSON.stringify(options));
      if (image) body.append('image', image);
      const response = await api.post('/posts', body);
      setTitle(''); setContent(''); setImage(null); setPollEnabled(false); setOptions(['', '']);
      onPosted?.(response.data.post);
    } catch (error) {
      setError(error.response?.data?.error || 'Could not publish your thread. Please try again.');
    } finally { setBusy(false); }
  }
  return <form className="new-post" id="create-thread" onSubmit={submit} aria-label="Create a thread">
    <div className="composer-heading"><Avatar url={user.avatar_url} username={user.username} />
      <span><strong>Share a thread</strong><small>Add text, photos or a poll.</small></span>
    </div>
    <input ref={titleInput} className="thread-title-input" aria-label="Thread title"
      placeholder={pollEnabled ? 'Your poll question...' : 'Thread title...'}
      maxLength={200} required value={title} onChange={event => setTitle(event.target.value)} disabled={busy} />
    <textarea aria-label="Thread text" maxLength={5000} placeholder="What's on your mind?"
      value={content} onChange={event => setContent(event.target.value)} disabled={busy} />
    {preview && <div className="attachment-preview">
      <img src={preview} alt="Selected photo" />
      <button type="button" disabled={busy} onClick={() => setImage(null)}>Remove photo</button>
    </div>}
    {pollEnabled && <fieldset className="poll-composer" disabled={busy}><legend><Icon name="poll" size={16} />Poll choices</legend>
      <p>Use your title as the question. Add 2–6 different answers.</p>
      {options.map((option, index) => <div className="poll-option-input" key={index}>
        <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <input aria-label={'Poll option ' + (index + 1)} placeholder={'Option ' + (index + 1)} maxLength={80} required
          value={option} onChange={event => setOptions(current => current.map((value, i) => i === index ? event.target.value : value))} />
        {options.length > 2 && <button type="button" aria-label={'Remove poll option ' + (index + 1)}
          onClick={() => setOptions(current => current.filter((_, i) => i !== index))}><Icon name="close" size={17} /></button>}
      </div>)}
      {options.length < 6 && <button type="button" className="add-poll-option" onClick={() => setOptions(current => [...current, ''])}><Icon name="plus" size={16} />Add option</button>}
    </fieldset>}
    <div className="new-post-actions">
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} hidden />
      <div className="composer-tools">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="photo" size={18} />Add photo</button>
        <button type="button" className={'secondary-button poll-toggle' + (pollEnabled ? ' active' : '')}
          aria-pressed={pollEnabled} disabled={busy} onClick={() => setPollEnabled(current => !current)}>
          <Icon name="poll" size={18} />{pollEnabled ? 'Remove poll' : 'Add poll'}</button>
      </div>
      <button type="submit" disabled={busy || !title.trim()}>{busy ? 'Publishing...' : 'Publish thread'}<Icon name="arrow" size={16} /></button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
