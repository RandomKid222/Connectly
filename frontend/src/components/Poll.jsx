import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import Icon from './Icon.jsx';

export default function Poll({ postId, poll }) {
  const [current, setCurrent] = useState(poll);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(false);
  useEffect(() => { if (!request.current) setCurrent(poll); }, [postId, poll]);
  async function vote(option) {
    if (request.current) return;
    request.current = true; setBusy(true); setError('');
    try {
      const response = option === null ? await api.delete('/posts/' + postId + '/vote')
        : await api.post('/posts/' + postId + '/vote', { option_id: option });
      setCurrent(response.data.poll);
    } catch (error) { setError(error.response?.data?.error || 'Your vote could not be saved. Try again.'); }
    finally { request.current = false; setBusy(false); }
  }
  if (!current) return null;
  return <section className="poll-card" aria-label="Thread poll">
    <div className="poll-heading"><span><Icon name="poll" size={16} />TAKE A SIDE</span><small>{current.totalVotes} {current.totalVotes === 1 ? 'vote' : 'votes'}</small></div>
    <div className="poll-options" role="group" aria-label="Poll choices">
      {current.options.map(option => {
        const selected = current.myVote === option.id;
        const percentage = current.totalVotes ? Math.round(option.votes * 100 / current.totalVotes) : 0;
        return <button type="button" key={option.id} className={'poll-choice' + (selected ? ' selected' : '')}
          aria-pressed={selected} disabled={busy} onClick={() => vote(option.id)}>
          {current.myVote && <span className="poll-fill" style={{ width: percentage + '%' }} aria-hidden="true" />}
          <span className="poll-choice-label">{selected ? <Icon name="check" size={15} /> : <span className="poll-radio" aria-hidden="true" />}{option.label}</span>
          {current.myVote && <span className="poll-percentage">{percentage}%</span>}
        </button>;
      })}
    </div>
    <div className="poll-footer"><span>{busy ? 'Saving your vote…' : current.myVote ? 'Your pick is in. You can change it.' : 'One pick. Every voice counts.'}</span>
      {current.myVote && <button type="button" disabled={busy} onClick={() => vote(null)}>Remove vote</button>}</div>
    {error && <p className="error" role="alert">{error}</p>}
    <span className="sr-only" role="status">{!busy && current.myVote ? 'Your vote is saved.' : ''}</span>
  </section>;
}
