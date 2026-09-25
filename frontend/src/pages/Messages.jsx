import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function Messages() {
  const { userId } = useParams();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [thread, setThread] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/messages/conversations').then(res => setConversations(res.data.conversations));
  }, [userId]);

  useEffect(() => {
    if (!userId) { setThread([]); setOtherUser(null); return; }
    api.get(`/messages/${userId}`).then(res => setThread(res.data.messages));
    const existing = conversations.find(c => String(c.id) === String(userId));
    if (existing) setOtherUser(existing);
  }, [userId, conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get(`/users?q=${encodeURIComponent(search)}`).then(res => setResults(res.data.users));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const res = await api.post(`/messages/${userId}`, { content: text });
    setThread([...thread, res.data.message]);
    setText('');
  }

  return (
    <div className="messages-layout">
      <aside className="conversation-list">
        <input
          placeholder="Search people..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {results.length > 0 && (
          <div className="search-results">
            {results.filter(u => u.id !== me.id).map(u => (
              <div key={u.id} className="conversation-item" onClick={() => { navigate(`/messages/${u.id}`); setSearch(''); }}>
                {u.username}
              </div>
            ))}
          </div>
        )}
        {conversations.map(c => (
          <div
            key={c.id}
            className={`conversation-item ${String(c.id) === userId ? 'active' : ''}`}
            onClick={() => navigate(`/messages/${c.id}`)}
          >
            <div className="conversation-name">{c.username}</div>
            <div className="conversation-preview">{c.lastMessage}</div>
          </div>
        ))}
        {conversations.length === 0 && <p className="muted">Search for someone to start chatting.</p>}
      </aside>

      <section className="thread">
        {!userId ? (
          <p className="muted centered">Select a conversation.</p>
        ) : (
          <>
            <div className="thread-header">{otherUser?.username || 'Conversation'}</div>
            <div className="thread-messages">
              {thread.map(m => (
                <div key={m.id} className={`bubble ${m.sender_id === me.id ? 'mine' : 'theirs'}`}>
                  {m.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="thread-input" onSubmit={send}>
              <input
                value={text}
                onChange={e => setText(e.target.value)}
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
