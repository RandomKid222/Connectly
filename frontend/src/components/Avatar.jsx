import React, { useEffect, useState } from 'react';
import { API_ORIGIN } from '../api';

export default function Avatar({ url, username, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const src = typeof url === 'string' &&
    (url.startsWith('https://') ? url : url.startsWith('/uploads/') ? API_ORIGIN + url : '');
  const classes = `avatar ${className}`.trim();
  if (src && !failed) {
    return <img className={classes} src={src} alt="" onError={() => setFailed(true)} />;
  }
  return <span className={classes} aria-hidden="true">{username?.[0]?.toUpperCase() || '?'}</span>;
}
