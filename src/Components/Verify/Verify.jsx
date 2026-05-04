import React, { useState } from "react";
import { Link } from "react-router-dom";
import "../Style/AuthStyle.css";
import ccLogo from "../Assets/CampusClearoutLogo.png";

const USERNAME_MAX_LENGTH = 50;
const PASSWORD_MAX_LENGTH = 128;

const getLimitMessage = (field, max) =>
  `${field} has reached the ${max}-character limit.`;

export default function Verify() {
  const [username, setUsername] = useState("");
  const [profPassword, setProfPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [limitError, setLimitError] = useState("");

  const handleProfessorVerify = async () => {
    setError("");
    setMessage("");
    setLimitError("");

    const trimmedName = username.trim();
    const trimmedPassword = profPassword.trim();

    if (!trimmedName || !trimmedPassword) {
      setError("Please enter your username and password before requesting a verification email.");
      return;
    }

    try {
      const response = await fetch(
        `/CSE442/2026-Spring/cse-442s/api/prof_register.php`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmedName, password: trimmedPassword })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(
          data.message ||
            `The name ${trimmedName} is not in our records. Please contact evannabo@buffalo.edu to have your information added to our database.`
        );
        return;
      }

      setMessage(
        `Thank you for signing up ${trimmedName}. A verification email has been sent to your email on file (${data.email_used}). If this email is incorrect, please contact evannabo@buffalo.edu to have your information updated in our database.`
      );
    } catch (err) {
      setError("We are unable to send a verification email right now. Please try again later.");
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
        <h2 className="auth-title">Professor Registration</h2>

        <label className="auth-label">Username</label>
        <input
          type="text"
          className="auth-input"
          placeholder="Banana Smith"
          value={username}
          onChange={(e) =>
            handleLimitedChange(e.target.value, setUsername, "Username", USERNAME_MAX_LENGTH)
          }
          maxLength={USERNAME_MAX_LENGTH}
          autoComplete="username"
          required
        />

        <label className="auth-label">Password</label>
        <input
          type="password"
          className="auth-input"
          placeholder="••••"
          value={profPassword}
          onChange={(e) =>
            handleLimitedChange(e.target.value, setProfPassword, "Password", PASSWORD_MAX_LENGTH)
          }
          maxLength={PASSWORD_MAX_LENGTH}
          required
        />

        <Link to="/signup" className="login-link-button">Not a professor? Sign up here</Link>
        <Link to="/login" className="login-link-button">Back to Log in</Link>

        {message && <p className="auth-success">{message}</p>}
        {(limitError || error) && (
          <p className="auth-error">{limitError || error}</p>
        )}

        <button className="auth-button" onClick={handleProfessorVerify}>
          Submit
        </button>
      </div>

      <p className="auth-subtext">
        Please enter your username and the password you just created.
        If your name is in our records, a verification email will be sent to your .edu email address.
        If your credentials do not match our records, please contact evannabo@buffalo.edu.
      </p>
    </div>
  );
}
