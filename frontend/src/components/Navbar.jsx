import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import UserSearch from './UserSearch.jsx';
import Avatar from './Avatar.jsx';
import Notifications from './Notifications.jsx';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  return (
    <header className="navbar"><div className="navbar-inner">
      <Brand />
      <UserSearch />
      <div className="nav-links">
        <Notifications />
        <Link to={`/profile/${user.username}`} className="account-link">
          <Avatar url={user.avatar_url} username={user.username} className="nav-avatar" />
          <span>{user.username}<VerifiedBadge verified={user.is_verified} /></span>
        </Link>
        <button type="button" className="mobile-logout" aria-label="Log out" onClick={logout}><Icon name="logout" size={18} /></button>
      </div>
    </div></header>
  );
}
