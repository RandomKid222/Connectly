import React from 'react';
import { Link } from 'react-router-dom';

export default function Brand() {
  return <Link to="/" className="brand" aria-label="Connectly home">
    <img src="/favicon.svg" width="40" height="40" alt="" />
    <span>connectly<span className="brand-period">↗</span></span>
  </Link>;
}
