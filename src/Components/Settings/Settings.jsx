import './Settings.css';
import { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UnreadContext } from '../../App';
import Navbar from '../Navbar/Navbar';

function Settings() {
  const navigate = useNavigate();
  const unreadCount = useContext(UnreadContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [username, setUsername] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [isProf, setIsProf] = useState(false);

  // Modals for inputs
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPhoto, setNewPhoto] = useState(null);

  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // Clean React states for handling backend errors gracefully
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [photoError, setPhotoError] = useState("");

  // State for the password success message
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const API_URL = "/CSE442/2026-Spring/cse-442s/api/settings.php";

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return navigate("/");

    fetch(API_URL, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
      cache: "no-store" 
    })
      .then(res => {
        if (res.status === 401) throw new Error("Unauthorized");
        return res.json();
      })
      .then(data => {
        if (data) {
          const isProfessor = String(data.prof) === "1" || 
                              String(data.prof).toLowerCase() === "true" || 
                              data.prof === 1 || 
                              data.prof === true;

          setUsername(data.username);
          setProfilePhoto(data.profile_photo);
          setIsProf(isProfessor);
        }
      })
      .catch(() => {
        localStorage.clear();
        navigate("/");
      });
  }, [navigate]);

  const updateUsername = async () => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("new_username", newUsername);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (res.ok) {
      setUsername(newUsername);
      localStorage.setItem("username", newUsername);
      setShowUsernameModal(false);
      setUsernameError(""); 
      setNewUsername("");
      
      if (data.prof !== undefined) {
        const isProfessor = String(data.prof) === "1" || 
                            String(data.prof).toLowerCase() === "true" || 
                            data.prof === 1 || 
                            data.prof === true;
        setIsProf(isProfessor);
      }
    } else {
      setUsernameError(data.message || "Failed to update username.");
    }
  };

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-={}[\]|:;"'<>,.?/]).{8,}$/;

  const updatePassword = async () => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("new_password", newPassword);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (res.ok) {
      setShowPasswordModal(false);
      setPasswordError(""); 
      
      // Clear the input fields and show the success message
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccess("Password updated successfully!");
      
      // Auto-hide the success message after 3 seconds
      setTimeout(() => {
        setPasswordSuccess("");
      }, 3000);

    } else {
      setPasswordError(data.message || "Failed to update password.");
    }
  };

  const updatePhoto = async () => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("profile_photo", newPhoto);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();

    if (res.ok) {
      setProfilePhoto(data.new_profile_photo);
      localStorage.setItem("profilePhoto", data.new_profile_photo);
      setShowPhotoModal(false);
      setPhotoError(""); 
    } else {
      setPhotoError(data.message || "Failed to upload photo.");
    }
  };

  const closeUsernameModal = () => {
    setShowUsernameModal(false);
    setUsernameError("");
    setNewUsername("");
  };

  return (
    <div className="layout-wrapper">
      <Navbar />
      <div className="settings-container">
        <div className="settings-profile-section">
          {profilePhoto ? (
            <img src={profilePhoto} alt="Profile" className="settings-profile-photo" />
          ) : (
            <div className="settings-profile-photo" style={{ backgroundColor: '#009966', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '60px', fontWeight: 'bold' }}>
              {username ? username[0].toUpperCase() : '?'}
            </div>
          )}
          <button className="settings-btn" onClick={() => setShowPhotoModal(true)}>
            Change Profile Photo
          </button>
        </div>

        <div className="settings-options">
          <h1>Settings</h1>
          <p>Manage your account settings and preferences here.</p>
          <p style={{ fontWeight: 600, marginBottom: "6px" }}>
            Current username: <span style={{ color: "#009966" }}>{username}</span>
          </p>

          {!isProf && (
            <button className="settings-btn" onClick={() => setShowUsernameModal(true)}>
              Reset Username
            </button>
          )}

          <button 
            className="settings-btn" 
            onClick={() => { 
              setShowPasswordModal(true); 
              setPasswordSuccess(""); // Clear any old success message when opening
            }}
          >
            Reset Password
          </button>
          
          {/* Render the success message natively on the page */}
          {passwordSuccess && (
            <p style={{ color: '#009966', fontWeight: 'bold', marginTop: '10px' }} role="status">
              <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '4px', fontSize: '18px' }}>check_circle</span>
              {passwordSuccess}
            </p>
          )}

        </div>
      </div>

      {/* Username Modal */}
      {showUsernameModal && (
        <div className="modal-overlay" onClick={closeUsernameModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Reset Username</h2>
            <input
              type="text"
              placeholder="New username"
              value={newUsername}
              onChange={(e) => { setNewUsername(e.target.value); setUsernameError(""); }}
              maxLength={50}
            />
            {usernameError && <div className="settings-error" role="alert">{usernameError}</div>}

            <button className="modal-submit" onClick={() => {
                if (!newUsername.trim()) {
                  setUsernameError("Please enter a new username.");
                  return;
                }
                updateUsername();
              }}>Submit</button>
            <button className="modal-cancel" onClick={closeUsernameModal}>Cancel</button>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => { setShowPasswordModal(false); setPasswordError(""); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Reset Password</h2>
            <input type="password" placeholder="New password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }} maxLength={128} />
            <input type="password" placeholder="Confirm new password" value={confirmNewPassword} onChange={(e) => { setConfirmNewPassword(e.target.value); setPasswordError(""); }} maxLength={128} />
            {passwordError && <div className="settings-error" role="alert">{passwordError}</div>}
            <button className="modal-submit" onClick={() => {
                if (!passwordRegex.test(newPassword)) { setPasswordError("Password must be at least 8 characters and include one uppercase, one lowercase, one number, and one special character."); return; }
                if (newPassword !== confirmNewPassword) { setPasswordError("Passwords do not match."); return; }
                updatePassword();
              }}>Submit</button>
            <button className="modal-cancel" onClick={() => { setShowPasswordModal(false); setPasswordError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {showPhotoModal && (
        <div className="modal-overlay" onClick={() => { setShowPhotoModal(false); setPhotoError(""); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Change Profile Photo</h2>
            <input 
              type="file" 
              accept="image/*" 
              onChange={(e) => { 
                const file = e.target.files[0];
                const MAX_FILE_SIZE = 2 * 1024 * 1024; // Exactly 2MB limit

                if (file && file.size > MAX_FILE_SIZE) {
                  setPhotoError("This image is too large. The max file limit is 2MB.");
                  e.target.value = ""; // Instantly clears the selected file
                  setNewPhoto(null);
                } else {
                  setNewPhoto(file); 
                  setPhotoError(""); 
                }
              }} 
            />            
            {photoError && <div className="settings-error" role="alert">{photoError}</div>}
            
            <button className="modal-submit" onClick={updatePhoto}>Upload</button>
            <button className="modal-cancel" onClick={() => { setShowPhotoModal(false); setPhotoError(""); }}>Cancel</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default Settings;