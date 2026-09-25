import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

export default function Messages() {
  const { userId } = useParams();
  const { user: me, refreshUnread } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [thread, setThread] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [threadError, setThreadError] = useState('');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const bottomRef = useRef(null);
  const threadMutation = useRef(0);
  const conversationRequest = useRef(0);

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
            ? current : res.data.messages);
        }
        setOtherUser(res.data.otherUser);
        setThreadError('');
        const unread = res.data.messages.filter(message =>
          Number(message.sender_id) === Number(userId) && !message.read_at);
        if (unread.length && document.visibilityState === 'visible') {
          await api.put(`/messages/${userId}/read`, { upToId: unread.at(-1).id });
          if (!cancelled) { refreshUnread(); loadConversations(); }
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

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
    if (!text.trim() || !userId) return;
    try {
      const res = await api.post(`/messages/${userId}`, { content: text });
      threadMutation.current += 1;
      setThread(current => current.some(message => message.id === res.data.message.id)
        ? current : [...current, res.data.message]);
      setText('');
      setThreadError('');
      loadConversations();
    } catch {
      setThreadError('Could not send your message. Please try again.');
    }
  }

  return (
    <div className="messages-layout">
      <aside className="conversation-list">
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
              </span>
            </span>
          </button>
        ))}
        {conversations.length === 0 && <p className="muted">Search for someone to start chatting.</p>}
      </aside>

      <section className="thread">
        {!userId ? (
          <p className="muted centered">Select a conversation.</p>
        ) : (
          <>
            <div className="thread-header">
              {otherUser && <Avatar url={otherUser.avatar_url} username={otherUser.username} className="conversation-avatar" />}
              {otherUser?.username || 'Conversation'}
            </div>
            {threadError && <p className="error thread-error" role="alert">{threadError}</p>}
            <div className="thread-messages">
              {thread.map(message => (
                <div key={message.id} className={`bubble ${message.sender_id === me.id ? 'mine' : 'theirs'}`}>
                  {message.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="thread-input" onSubmit={send}>
              <input
                value={text}
                maxLength={5000}
                onChange={event => setText(event.target.value)}
                placeholder="Type a message..."
              />
              <button type="submit">Send</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
