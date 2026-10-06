import React from 'react';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';

export default function AuthLayout({ children }) {
  return <div className="auth-layout">
    <section className="auth-story" aria-label="Welcome to Connectly">
      <Brand />
      <div className="auth-story-content">
        <span className="eyebrow">THE SOCIAL SIDE OF THINGS</span>
        <h2>THE INTERNET.<br />A LITTLE MORE<br /><em>YOU.</em></h2>
        <p>Find the people who get it. Share the things you can't keep to yourself.</p>
        <div className="auth-poster" aria-hidden="true">
          <div className="poster-cutout"><img src="/favicon.svg" alt="" /><span>THOUGHTS<br />WORTH<br />KEEPING.</span></div>
          <span className="poster-spark"><Icon name="spark" size={64} /></span>
          <span className="poster-ticket">OPEN INVITATION<br /><strong>Come as you are.</strong></span>
        </div>
      </div>
      <span className="auth-story-footer">Different people. Shared stories. Connectly.</span>
    </section>
    <section className="auth-form-wrap"><div className="auth-mobile-brand"><Brand /></div>{children}</section>
  </div>;
}
