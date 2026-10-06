import React from 'react';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';

export default function AuthLayout({ children }) {
  return <div className="auth-layout">
    <section className="auth-story" aria-label="Welcome to Connectly">
      <Brand />
      <div className="auth-story-content">
        <span className="eyebrow">Welcome to Connectly</span>
        <h2>Stay close,<br /><em>stay connected.</em></h2>
        <p>Share everyday moments, find your people, and keep the conversation going.</p>
        <div className="connection-art" aria-hidden="true"><span /><img src="/favicon.svg" alt="" /><span /></div>
        <div className="auth-features"><span><Icon name="message" size={18} />Threads & conversations</span>
          <span><Icon name="photo" size={18} />Photos & moments</span>
          <span><Icon name="poll" size={18} />Community polls</span></div>
      </div>
      <span className="auth-story-footer">Your community, wherever you are.</span>
    </section>
    <section className="auth-form-wrap"><div className="auth-mobile-brand"><Brand /></div>{children}</section>
  </div>;
}
