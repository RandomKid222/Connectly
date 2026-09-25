import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import UserSearch from './UserSearch.jsx';

export default function Navbar() {
  const { user, logout, unreadCount } = useAuth();
  return (
    <nav className="navbar">
      <Link to="/" className="brand">Connectly</Link>
      <UserSearch />
      <div className="nav-links">
        <Link to="/">Feed</Link>
        <Link to="/messages" className="message-nav-link"
          aria-label={unreadCount ? `Messages, ${unreadCount} unread` : 'Messages'}>
          Messages {unreadCount > 0 && <span className="unread-dot" aria-hidden="true" />}
        </Link>
        <Link to={`/profile/${user.username}`}>{user.username}</Link>
        <button className="link-btn" onClick={logout}>Log out</button>
      </div>
    </nav>
  );
}
