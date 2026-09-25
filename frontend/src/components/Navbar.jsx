import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  return (
    <nav className="navbar">
      <Link to="/" className="brand">Connectly</Link>
      <div className="nav-links">
        <Link to="/">Feed</Link>
        <Link to="/messages">Messages</Link>
        <Link to={`/profile/${user.username}`}>{user.username}</Link>
        <button className="link-btn" onClick={logout}>Log out</button>
      </div>
    </nav>
  );
}
