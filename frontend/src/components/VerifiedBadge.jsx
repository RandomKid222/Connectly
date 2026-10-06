import React from 'react';

export default function VerifiedBadge({ verified }) {
  if (!verified) return null;
  return <svg className="verified-badge" viewBox="0 0 24 24" role="img" aria-label="Verified account">
    <title>Verified by Connectly</title>
    <path d="m12 1 3.1 2.1 3.7.3 1.1 3.6 2.1 3-1.5 3.4.1 3.8-3.5 1.5-2.5 2.8-3.6-1-3.6 1-2.5-2.8L2 17.2l.1-3.8L.6 10 2.7 7l1.1-3.6 3.7-.3Z" fill="var(--accent)" stroke="#192015" strokeWidth="1" />
    <path d="m7.5 11.8 3 3.1 6-6.2" fill="none" stroke="#192015" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
