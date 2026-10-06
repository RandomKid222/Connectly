import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import LocalTime from '../components/LocalTime.jsx';
import ProtectedImage from '../components/ProtectedImage.jsx';
import Icon from '../components/Icon.jsx';

export default function Messages() {
  const { userId } = useParams();
  const { user: me, refreshUnread } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [thread, setThread] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [threadError, setThreadError] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [sending, setSending] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const imageInput = useRef(null);
  const sendingRef = useRef(false);
  const activeRecipient = useRef(userId);
  activeRecipient.current = userId;
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const messagesRef = useRef(null);
  const threadMutation = useRef(0);
  const conversationRequest = useRef(0);

  useEffect(() => { setText(''); setImage(null); setCanSend(false); }, [userId]);
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const loadConversations = useCallback(async () => {
    const request = ++conversationRequest.current;
    try {
      const res = await api.get('/messages/conversations');
      if (request === conversationRequest.current) setConversations(res.data.conversations);
    } catch {
      // The next refresh will retry if the backend is waking up.
    }
  }, []);

  useEffect(() => {
    loadConversations();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadConversations();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadConversations();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadConversations, userId]);

  useEffect(() => {
    if (!userId) {
      setThread([]);
      setOtherUser(null);
      setThreadError('');
      return;
    }
    setThread([]);
    setOtherUser(null);
    setThreadError('');
    let cancelled = false;
    let busy = false;
    const loadThread = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      const version = threadMutation.current;
      try {
        const res = await api.get(`/messages/${userId}`);
        if (cancelled) return;
        if (version === threadMutation.current) {
          setThread(current => current.length === res.data.messages.length &&
            current.every((message, index) => message.id === res.data.messages[index].id &&
              message.content === res.data.messages[index].content)
              && current.every((message, index) => message.image_url === res.data.messages[index].image_url &&
                message.read_at === res.data.messages[index].read_at)
            ? current : res.data.messages);
        }
        setOtherUser(res.data.otherUser);
        setCanSend(res.data.canSend);
        setThreadError('');
        const unread = res.data.messages.filter(message =>
          Number(message.sender_id) === Number(userId) && !message.read_at);
        if (unread.length && document.visibilityState === 'visible') {
          await api.put(`/messages/${userId}/read`, { upToId: unread.at(-1).id });
          if (!cancelled) {
            refreshUnread(); loadConversations();
            window.dispatchEvent(new Event('connectly:activity'));
          }
        }
      } catch {
        if (!cancelled) setThreadError('Could not load this conversation. Try again shortly.');
      } finally {
        busy = false;
      }
    };
    loadThread();
    const timer = setInterval(loadThread, 15000);
    document.addEventListener('visibilitychange', loadThread);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', loadThread);
    };
  }, [userId, refreshUnread, loadConversations]);

  const scrollToBottom = useCallback(() => {
    const element = messagesRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, []);
  useEffect(scrollToBottom, [thread, scrollToBottom]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/users', { params: { q: search.trim() }, signal: controller.signal });
        if (active) setResults(res.data.users);
      } catch {
        if (active) setResults([]);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [search]);

  async function send(event) {
    event.preventDefault();
    if ((!text.trim() && !image) || !userId || !canSend || sendingRef.current) return;
    const recipient = userId;
    sendingRef.current = true;
    setSending(true);
    try {
      const body = new FormData();
      body.append('content', text);
      if (image) body.append('image', image);
      const res = await api.post('/messages/' + recipient, body);
      if (activeRecipient.current !== recipient) { loadConversations(); return; }
      threadMutation.current += 1;
      setThread(current => current.some(message => message.id === res.data.message.id)
        ? current : [...current, res.data.message]);
      setText('');
      setImage(null);
      setThreadError('');
      loadConversations();
    } catch (error) {
      if (activeRecipient.current === recipient) {
        setThreadError(error.response?.data?.error || 'Could not send your message. Please try again.');
      }
    } finally { sendingRef.current = false; setSending(false); }
  }

  function chooseImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setThreadError('Choose a JPG, PNG, or WebP image.'); return;
    }
    if (file.size > 5 * 1024 * 1024) { setThreadError('The photo must be at most 5 MB.'); return; }
    setThreadError(''); setImage(file);
  }

  return (
    <div className={'messages-page' + (userId ? ' has-conversation' : '')}>
    <header className="page-heading compact-heading"><span className="eyebrow">KEEP THE CONVERSATION GOING</span><h1>Messages</h1><p>A little closer, one message at a time.</p></header>
    <div className="messages-layout">
      <aside className="conversation-list">
        <div className="inbox-heading"><h2>Your inbox</h2><Icon name="message" size={20} /></div>
        <input
          aria-label="Search people to message"
          placeholder="Search people..."
          maxLength={50}
          value={search}
          onChange={event => { setSearch(event.target.value); setResults([]); }}
        />
        {results.length > 0 && (
          <div className="search-results">
            {results.filter(user => user.id !== me.id).map(user => (
              <button key={user.id} type="button" className="conversation-item"
                onClick={() => { navigate(`/messages/${user.id}`); setSearch(''); }}>
                <span className="conversation-main">
                  <Avatar url={user.avatar_url} username={user.username} className="conversation-avatar" />
                  {user.username}
                </span>
              </button>
            ))}
          </div>
        )}
        {!conversations.length && !search && <p className="conversation-empty">Find someone above and say hello.</p>}
        {conversations.map(conversation => (
          <button
            type="button"
            key={conversation.id}
            className={`conversation-item ${String(conversation.id) === userId ? 'active' : ''}`}
            onClick={() => navigate(`/messages/${conversation.id}`)}
          >
            <span className="conversation-main">
              <Avatar url={conversation.avatar_url} username={conversation.username} className="conversation-avatar" />
              <span className="conversation-details">
                <span className="conversation-name-row">
                  <span className="conversation-name">{conversation.username}</span>
                  {Number(conversation.unreadCount) > 0 &&
                    <span className="unread-dot" aria-label={`${conversation.unreadCount} unread messages`} />}
                </span>
                <span className="conversation-preview">{conversation.lastMessage}</span>
                <LocalTime value={conversation.lastAt} className="conversation-time" />
              </span>
            </span>
          </button>
        ))}
      </aside>

      <section className="thread">
        {!userId ? (
          <div className="inbox-empty"><span className="empty-icon"><Icon name="message" size={34} /></span><h2>A hello goes a long way.</h2>
            <p>Choose a conversation, or search for someone new to talk to.</p></div>
        ) : (
          <>
            <div className="thread-header">
              <Link to="/messages" className="mobile-back" aria-label="Back to inbox"><Icon name="back" size={21} /></Link>
              {otherUser && <Avatar url={otherUser.avatar_url} username={otherUser.username} className="conversation-avatar" />}
              <span>{otherUser?.username || 'Conversation'}<small>Your conversation</small></span>
              <Icon name="message" size={20} className="thread-header-icon" />
            </div>
            {threadError && <p className="error thread-error" role="alert">{threadError}</p>}
            <div className="thread-messages" ref={messagesRef}>
              {thread.map(message => (
                <div key={message.id} className={`bubble ${message.sender_id === me.id ? 'mine' : 'theirs'}`}>
                  {message.image_url && <ProtectedImage src={message.image_url} className="message-image"
                    alt={'Photo from ' + (message.sender_id === me.id ? 'you' : otherUser?.username || 'this member')}
                    onLoad={scrollToBottom} />}
                  {message.content && <p className="message-content">{message.content}</p>}
                  <LocalTime value={message.created_at} className="message-time" />
                </div>
              ))}
            </div>
            <form className="thread-composer" onSubmit={send}>
              {preview && <div className="attachment-preview message-attachment">
                <img src={preview} alt="Selected photo" />
                <button type="button" disabled={sending} onClick={() => setImage(null)}>Remove photo</button>
              </div>}
              {!canSend && otherUser && <p className="muted message-permission">This member is not accepting messages from you.</p>}
              <div className="thread-input">
              <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={chooseImage} />
              <button type="button" className="attach-button" aria-label="Attach photo" disabled={sending || !canSend}
                onClick={() => imageInput.current?.click()}><Icon name="photo" size={20} /><span>Photo</span></button>
              <input
                value={text}
                aria-label="Message text"
                disabled={sending || !canSend}
                maxLength={5000}
                onChange={event => setText(event.target.value)}
                placeholder="Type a message..."
              />
              <button type="submit" disabled={sending || !canSend || (!text.trim() && !image)}>{sending ? 'Sending...' : 'Send'}<Icon name="arrow" size={17} /></button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
    </div>
  );
}
