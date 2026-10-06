import React, { useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Feed from './pages/Feed.jsx';
import Profile from './pages/Profile.jsx';
import Messages from './pages/Messages.jsx';
import Thread from './pages/Thread.jsx';
import Settings from './pages/Settings.jsx';
import SavedThreads from './pages/SavedThreads.jsx';
import Admin from './pages/Admin.jsx';

function RouteScroll() {
  const { pathname } = useLocation();
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="centered">Loading...</div>;

  return (
    <div className={user ? 'app-shell' : 'public-shell'}>
      <RouteScroll />
      {user && <Navbar />}
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className={user ? 'app-body' : 'public-body'}>
      {user && <Sidebar />}
      <main className="page-container" id="main-content">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/signup" element={user ? <Navigate to="/" /> : <Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<PrivateRoute><Feed /></PrivateRoute>} />
          <Route path="/profile/:username" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/messages" element={<PrivateRoute><Messages /></PrivateRoute>} />
          <Route path="/messages/:userId" element={<PrivateRoute><Messages /></PrivateRoute>} />
          <Route path="/threads/:id" element={<PrivateRoute><Thread /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/saved" element={<PrivateRoute><SavedThreads /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute>{user?.role === 'admin' ? <Admin /> : <Navigate to="/" replace />}</PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      </div>
    </div>
  );
}
