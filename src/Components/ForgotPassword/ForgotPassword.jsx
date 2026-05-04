import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import "../Style/AuthStyle.css";
import ccLogo from "../Assets/CampusClearoutLogo.png";

const forgotPasswordMessages = {
  "Email and username are required": "Please enter both your username and email address.",
  "Email must be @buffalo.edu": "Please use your Buffalo email address.",
  "Username and email do not match": "The username and email address do not match our records.",
  "Failed to send email": "We could not send the reset email. Please try again shortly.",
  "Password reset email sent": "If you have an account with us, password reset instructions have been sent to your email address.",
  "Database connection failed": "We are unable to process your request right now. Please try again later.",
  "Invalid request": "We could not process this request. Please refresh the page and try again.",
  "Could not create reset token": "We could not create a reset link. Please try again shortly.",
};

const getForgotPasswordMessage = (message, fallback) =>
  forgotPasswordMessages[message] || message || fallback;

const USERNAME_MAX_LENGTH = 50;

const ForgotPassword = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  if (localStorage.getItem("token")) {
    return <Navigate to="/homepage" replace />;
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    setMsg("");

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    if (!trimmedUsername || !trimmedEmail) {
      setError("Please enter your username and email address.");
      return;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!emailOk) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      const res = await fetch(
        "/CSE442/2026-Spring/cse-442s/api/forgot_password.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: trimmedUsername,
            email: trimmedEmail,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(
          getForgotPasswordMessage(
            data.message,
            "We could not send a reset link. Please try again."
          )
        );
        return;
      }

      setMsg(
        getForgotPasswordMessage(
          data.message,
          "If you have an account with us, password reset instructions have been sent to your email address."
        )
      );
      setUsername("");
      setEmail("");
    } catch (err) {
      setError("We are unable to process your request right now. Please try again later.");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-brand">
        <Link to="/">
          <img src={ccLogo} alt="Campus Clearout" className="auth-brand-logo" />
        </Link>
      </div>

      <div className="auth-card">
        <h2 className="auth-title">Forgot Password</h2>

        <form onSubmit={handleForgotPassword} className="auth-form">
          <label className="auth-label">Username</label>
          <input
            type="text"
            className="auth-input"
            placeholder="Jane Smith"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={USERNAME_MAX_LENGTH}
          />

          <label className="auth-label">Email</label>
          <input
            type="email"
            className="auth-input"
            placeholder="banana@buffalo.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={100}
          />

          <Link to="/login" className="login-link-button">Back to Log in</Link>

          {error && <p className="auth-error">{error}</p>}
          {msg && <p className="auth-success">{msg}</p>}

          <button type="submit" className="auth-button">Submit</button>
        </form>
      </div>

      <p className="auth-subtext">
        Enter your email address, and we will send you a link to reset your password if you have a valid account
      </p>
    </div>
  );
};

export default ForgotPassword;
