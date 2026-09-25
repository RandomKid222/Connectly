import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const userIdRef = useRef(null);
  userIdRef.current = user?.id ?? null;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then(res => setUser(res.data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const refreshUnread = useCallback(async () => {
    const requestedFor = userIdRef.current;
    if (!requestedFor) return;
    try {
      const res = await api.get('/messages/unread');
      if (userIdRef.current === requestedFor) {
        setUnreadCount(Number(res.data.unreadCount) || 0);
      }
    } catch {
      // Keep the last known count when the service is waking up or offline.
    }
  }, []);

  useEffect(() => {
    if (!user?.id) { setUnreadCount(0); return; }
    setUnreadCount(0);
    refreshUnread();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshUnread();
    }, 30000);
    const onFocus = () => {
      if (document.visibilityState === 'visible') refreshUnread();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id, refreshUnread]);

  async function login(emailOrUsername, password) {
    const res = await api.post('/auth/login', { emailOrUsername, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
  }

  async function signup(username, email, password) {
    const res = await api.post('/auth/signup', { username, email, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, signup, logout,
      unreadCount, refreshUnread }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
