import './App.css';
import HomePage from './Components/HomePage/HomePage';
import Landing from './Components/Landing/Landing';
import Login from './Components/Login/Login';
import Signup from './Components/SignUp/SignUp';
import Verify from './Components/Verify/Verify';
import Settings from './Components/Settings/Settings';
import ListingPage from './Components/ListingPage/ListingPage';
import CoursePage from './Components/CoursePage/CoursePage';
import Inbox from './Components/Inbox/Inbox';
import logo from './Components/Assets/CampusClearoutLogo.png';
import ForgotPassword from './Components/ForgotPassword/ForgotPassword';
import ResetPassword from './Components/ResetPassword/ResetPassword';
import SavedPage from './Components/Saved/SavedPage';
import Store from './Components/Store/Store';
import BundlePage from './Components/BundlePage/BundlePage';



import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import React, { createContext, useState, useEffect, useRef } from 'react';

export const UnreadContext = createContext(0);

function playReceiveSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (_) {}
}

function LoginPrompt() {
  const navigate = useNavigate();
  return (
    <div className="auth-container">
      <div className="auth-brand">
        <img src={logo} alt="Campus Clearout" className="auth-brand-logo" />
      </div>
      <div className="auth-card">
        <h2 className="auth-title">Login required</h2>
        <p className="auth-subtext" style={{ marginTop: 0, marginBottom: "1.25rem" }}>
          You need to be logged in to access this page.
        </p>
        <button className="auth-button" onClick={() => navigate("/login")}>Log In</button>
        <button
          className="auth-button"
          style={{ backgroundColor: "transparent", color: "var(--dark-green)", boxShadow: "none", border: "1px solid var(--dark-green)" }}
          onClick={() => navigate("/signup")}
        >
          Sign Up
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  const expires = localStorage.getItem("token_expires");

  const isExpired = expires && Date.now() > parseInt(expires);

  if (!token || isExpired) {
    localStorage.removeItem("token");
    localStorage.removeItem("token_expires");
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    return <LoginPrompt />;
  }

  return children;
}

function App() {
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef(0);

  useEffect(() => {
    const ping = async () => {
      if (document.hidden) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        await fetch(`/CSE442/2026-Spring/cse-442s/api/ping.php`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
      } catch (_) {}
    };
    ping();
    const pingInterval = setInterval(ping, 10000);
    return () => clearInterval(pingInterval);
  }, []);

  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`/CSE442/2026-Spring/cse-442s/api/get_conversations.php`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;
        const total = data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
        if (total > prevUnreadRef.current) playReceiveSound();
        prevUnreadRef.current = total;
        setUnreadCount(total);
      } catch (_) {}
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <UnreadContext.Provider value={unreadCount}>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/homepage" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/courses" element={<ProtectedRoute><CoursePage /></ProtectedRoute>} />
          <Route path="/saved" element={<ProtectedRoute><SavedPage /></ProtectedRoute>} />
          <Route path="/listingpage" element={<ProtectedRoute><ListingPage /></ProtectedRoute>} />
          <Route path="/bundlepage" element={<ProtectedRoute><BundlePage /></ProtectedRoute>} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/store/:username" element={<Store />} />
        </Routes>
      </Router>
    </UnreadContext.Provider>
  );
}

export default App;
