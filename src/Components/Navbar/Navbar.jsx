import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UnreadContext } from '../../App';
import navLogo from '../Assets/CampusClearoutLogo.png';
import './Navbar.css';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation(); 
  const unreadCount = useContext(UnreadContext);
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const loggedInUser = localStorage.getItem("username");
  const storePath = loggedInUser ? `/store/${encodeURIComponent(loggedInUser)}` : "/homepage";

  // Fetch the logged-in user's profile photo
  useEffect(() => {
    const fetchAvatar = async () => {
      if (!loggedInUser) return;
      const token = localStorage.getItem("token");
      try {
        const response = await fetch(`/CSE442/2026-Spring/cse-442s/api/get_store.php?username=${encodeURIComponent(loggedInUser)}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.profile && data.profile.profile_photo) {
            setAvatar(data.profile.profile_photo);
          }
        }
      } catch (err) {
        console.error("Failed to load avatar for navbar", err);
      }
    };

    fetchAvatar();
  }, [loggedInUser]);

  const handleLogout = async () => {
    const token = localStorage.getItem("token");
    try {
      await fetch(`/CSE442/2026-Spring/cse-442s/api/logout.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch (err) {
      console.error(err);
    }
    localStorage.removeItem("token");
    localStorage.removeItem("token_expires");
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    navigate("/");
  };

  const openLogoutConfirm = () => {
    setIsMenuOpen(false);
    setShowLogoutConfirm(true);
  };

  const isActive = (path) => location.pathname === path ? 'active-nav' : '';

  return (
    <header className="top-nav-bar">
      <div className="nav-left">
        <Link to="/homepage">
          <img src={navLogo} alt="Logo" className="brand-logo" />
        </Link>
      </div>

      <nav className="pill-container desktop-nav">
        <Link to="/homepage" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={`pill-item ${isActive('/homepage')}`}>
            <span className="material-symbols-outlined">home</span>
            <label>Home</label>
          </div>
        </Link>

        <Link to="/courses" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={`pill-item ${isActive('/courses')}`}>
            <span className="material-symbols-outlined">book</span>
            <label>Courses</label>
          </div>
        </Link>
        
        <Link to="/inbox" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={`pill-item nav-mail-wrapper ${isActive('/inbox')}`}>
            <span className="material-symbols-outlined">mail</span>
            {unreadCount > 0 && <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            <label>Inbox</label>
          </div>
        </Link>
        
        <Link to={storePath} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={`pill-item ${isActive(storePath)}`}>
            <span className="material-symbols-outlined">person</span>
            <label>My Store</label>
          </div>
        </Link>

        <Link to="/saved" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={`pill-item ${isActive('/saved')}`}>
            <span className="material-symbols-outlined">bookmark</span>
            <label>Saved</label>
          </div>
        </Link>

        <Link to="/settings" style={{ textDecoration: "none", color: "inherit" }}>
          <div className={`pill-item ${isActive('/settings')}`}>
            <span className="material-symbols-outlined">settings</span>
            <label>Settings</label>
          </div>
        </Link>
      </nav>

      {/* MOBILE MENU */}
      <div className="mobile-menu-trigger">
        <span className="material-symbols-outlined" onClick={() => setIsMenuOpen(!isMenuOpen)}>menu</span>
        {isMenuOpen && (
          <div className="mobile-dropdown">
            <Link to="/homepage" style={{ textDecoration: 'none', color: 'inherit' }}><div className="dropdown-item">Home</div></Link>
            <Link to="/courses" style={{ textDecoration: 'none', color: 'inherit' }}><div className="dropdown-item">Courses</div></Link>
            <Link to="/inbox" style={{ textDecoration: 'none', color: 'inherit' }}><div className="dropdown-item">Inbox</div></Link>
            <Link to={storePath} style={{ textDecoration: 'none', color: 'inherit' }}><div className="dropdown-item">My Store</div></Link>
            <Link to="/saved" style={{ textDecoration: 'none', color: 'inherit' }}><div className="dropdown-item">Saved</div></Link>
            <Link to="/settings" style={{ textDecoration: "none", color: "inherit" }}><div className="dropdown-item">Settings</div></Link>
            <div className="dropdown-item" onClick={openLogoutConfirm}>Logout</div>
          </div>
        )}
      </div>
      
      {/* DESKTOP RIGHT (LOGOUT + PROFILE PIC) */}
      <div className="nav-right desktop-nav">
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
        <Link to={`/store/${loggedInUser}`} style={{ textDecoration: 'none', display: 'flex' }}>
          {avatar ? (
            <img src={avatar} alt="Profile" className="nav-profile-pic" />
          ) : (
            <div className="nav-profile-pic default-nav-avatar">
              {loggedInUser ? loggedInUser[0].toUpperCase() : '?'}
            </div>
          )}
        </Link>
      </div>

      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Logout</h2>
            <p>Are you sure you want to log out?</p>
            <button
              className="modal-submit"
              style={{ backgroundColor: 'var(--dark-green, #009966)' }}
              onClick={handleLogout}
            >
              Yes, Log Out
            </button>
            <button className="modal-cancel" onClick={() => setShowLogoutConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
