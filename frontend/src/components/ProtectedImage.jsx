import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedImage({ src, alt = 'Shared photo', className, onLoad }) {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const controller = new AbortController();
    setUrl('');
    setError(false);
    if (!/^\/(messages|posts)\/\d+\/image$/.test(src || '')) { setError(true); return; }
    api.get(src, { responseType: 'blob', signal: controller.signal }).then(response => {
      if (!active) return;
      objectUrl = URL.createObjectURL(response.data);
      setUrl(objectUrl);
    }).catch(() => { if (active) setError(true); });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, user?.id, retry]);
  if (error) return <div className="photo-placeholder" role="status">
    Photo unavailable. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>
  </div>;
  if (!url) return <div className="photo-placeholder" role="status">Loading photo...</div>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="photo-link" title="Open full photo">
    <img src={url} alt={alt} className={className} onLoad={onLoad} />
  </a>;
}
