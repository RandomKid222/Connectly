import React from 'react';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';

export default function AuthLayout({ children }) {
  return <div className="auth-layout">
    <section className="auth-story" aria-label="Welcome to Connectly">
      <Brand />
      <div className="auth-story-content">
        <span className="eyebrow">A PLACE TO BE YOURSELF</span>
        <h2>The little moments.<br />The long conversations.</h2>
        <p>Share what matters, find your people, and make a space that feels like you.</p>
        <div className="connection-art" aria-hidden="true">
          <span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" />
          <span className="art-node node-one"><Icon name="message" size={32} /></span>
          <span className="art-node node-two"><Icon name="photo" size={28} /></span>
          <span className="art-node node-three"><Icon name="user" size={26} /></span>
          <span className="art-center"><img src="/favicon.svg" alt="" /></span>
        </div>
      </div>
      <span className="auth-story-footer">Your people. Your conversations. Your place.</span>
    </section>
    <section className="auth-form-wrap"><div className="auth-mobile-brand"><Brand /></div>{children}</section>
  </div>;
}
