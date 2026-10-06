import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

export default function Sidebar() {
  const { user, logout, unreadCount } = useAuth();
  return <aside className="app-sidebar">
    <p className="sidebar-label">THE SHORTCUTS</p>
    <nav className="side-nav" aria-label="Main navigation">
      <NavLink to="/" end><Icon name="home" /><span>Feed</span></NavLink>
      <NavLink to="/messages" className="message-nav-link"
        aria-label={unreadCount ? `Messages, ${unreadCount} unread` : 'Messages'}>
        <Icon name="message" /><span>Messages</span>
        {unreadCount > 0 && <span className="unread-dot" aria-hidden="true" />}
      </NavLink>
      <NavLink to="/saved"><Icon name="bookmark" /><span>Saved</span></NavLink>
      <NavLink to={'/profile/' + user.username} aria-label="Your profile"><Icon name="user" /><span>Profile</span></NavLink>
      <NavLink to="/settings"><Icon name="settings" /><span>Settings</span></NavLink>
    </nav>
    <div className="sidebar-note"><Icon name="spark" size={38} />
      <p>KEEP THE<br /><strong>GOOD BITS.</strong></p>
      <Link to="/saved">Your saved threads <Icon name="arrow" size={16} /></Link>
    </div>
    <div className="sidebar-account">
      <Link to={'/profile/' + user.username}>
        <Avatar url={user.avatar_url} username={user.username} />
        <span><strong>{user.username}</strong><small>Your personal space</small></span>
      </Link>
      <button type="button" className="logout-button" onClick={logout}><Icon name="logout" size={18} />Log out</button>
    </div>
  </aside>;
}
