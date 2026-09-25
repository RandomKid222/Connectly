import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Feed from './pages/Feed.jsx';
import Profile from './pages/Profile.jsx';
import Messages from './pages/Messages.jsx';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="centered">Loading...</div>;

  return (
    <>
      {user && <Navbar />}
      <div className="page-container">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/signup" element={user ? <Navigate to="/" /> : <Signup />} />
          <Route path="/" element={<PrivateRoute><Feed /></PrivateRoute>} />
          <Route path="/profile/:username" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/messages" element={<PrivateRoute><Messages /></PrivateRoute>} />
          <Route path="/messages/:userId" element={<PrivateRoute><Messages /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </>
  );
}
