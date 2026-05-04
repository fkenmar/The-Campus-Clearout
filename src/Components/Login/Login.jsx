import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import "../Style/AuthStyle.css";
import ccLogo from "../Assets/CampusClearoutLogo.png";

const loginMessages = {
  "Invalid email or password": "The email or password you entered is incorrect. Please try again or click Forgot Password? below if you have forgotten it.",
  "Email and password are required": "Please enter your email and password.",
  "Database connection failed": "We are unable to sign you in right now. Please try again later.",
};

const getLoginMessage = (message, fallback) =>
  loginMessages[message] || message || fallback;

const getLimitMessage = (field, max) =>
  `${field} has reached the ${max}-character limit.`;

const EMAIL_MAX_LENGTH = 100;
const PASSWORD_MAX_LENGTH = 128;

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [limitError, setLimitError] = useState("");
  const [banned, setBanned] = useState(false);

  if (localStorage.getItem("token")) return <Navigate to="/homepage" replace />;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBanned(false);
    setLimitError("");

    const trimmedEmail = email.trim();

    try {
      const response = await fetch(`/CSE442/2026-Spring/cse-442s/api/login.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.banned) {
          setBanned(true);
        } else {
          setError(
            getLoginMessage(
              data.message,
              "The email or password you entered is incorrect."
            )
          );
        }
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("token_expires", data.expires_at);
      localStorage.setItem("username", data.username);
      if (data.user_id !== undefined && data.user_id !== null) {
        localStorage.setItem("user_id", String(data.user_id));
      } else {
        localStorage.removeItem("user_id");
      }
      navigate("/homepage");

    } catch (err) {
      setError("We are unable to sign you in right now. Please try again later.");
    }
  };

  const handleLimitedChange = (value, setter, field, max) => {
    setter(value);
    setLimitError(value.length === max ? getLimitMessage(field, max) : "");
  };

  return (
    <div className="auth-container">
      <div className="auth-brand">
        <Link to="/">
          <img src={ccLogo} alt="Campus Clearout" className="auth-brand-logo" />
        </Link>
      </div>

      <div className="auth-card">
        <h2 className="auth-title">Log In</h2>

        <form className="auth-form" onSubmit={handleLogin}>
          <label className="auth-label">UB Email</label>
          <input
            type="email"
            className="auth-input"
            placeholder="banana@buffalo.edu"
            value={email}
            onChange={(e) =>
              handleLimitedChange(e.target.value, setEmail, "Email", EMAIL_MAX_LENGTH)
            }
            maxLength={EMAIL_MAX_LENGTH}
            autoComplete="email"
          />

          <label className="auth-label">Password</label>
          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              className="auth-input"
              placeholder="••••"
              value={password}
              onChange={(e) =>
                handleLimitedChange(e.target.value, setPassword, "Password", PASSWORD_MAX_LENGTH)
              }
              maxLength={PASSWORD_MAX_LENGTH}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <Link to="/signup" className="login-link-button">Don't have an account? Register</Link>

          {banned && (
            <div className="auth-error" role="alert" style={{ lineHeight: "1.5" }}>
              <strong>Account Removed</strong><br />
              Your username exceeded the 50-character limit. Your account has been deleted. Please sign up again with a shorter username.
            </div>
          )}
          {!banned && (limitError || error) && (
            <div className="auth-error" role="alert">
              {limitError || error}
            </div>
          )}

          <Link to="/forgot-password" className="login-link-button">Forgot Password?</Link>

          <button type="submit" className="auth-button">Submit</button>
        </form>
      </div>
    </div>
  );
};

export default Login;
