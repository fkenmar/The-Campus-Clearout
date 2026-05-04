import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import "../Style/AuthStyle.css";
import ccLogo from "../Assets/CampusClearoutLogo.png";

const USERNAME_MAX_LENGTH = 50;
const EMAIL_MAX_LENGTH = 100;
const PASSWORD_MAX_LENGTH = 128;

const getLimitMessage = (field, max) =>
  `${field} has reached the ${max}-character limit.`;

export default function SignUp() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [limitError, setLimitError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  if (localStorage.getItem("token")) return <Navigate to="/homepage" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLimitError("");

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    if (!trimmedUsername || !trimmedEmail || !password || !confirmPassword) {
      setError("Please complete all signup fields.");
      return;
    }

    if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
      setError("Username must be 50 characters or fewer.");
      return;
    }

    if (!trimmedEmail.toLowerCase().endsWith("@buffalo.edu")) {
      setError("Please use your University at Buffalo (@buffalo.edu) email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords entered do not match.");
      return;
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).{8,}$/;

    if (!passwordRegex.test(password)) {
      setError(
        "Password must be at least 8 characters and include one uppercase, one lowercase, one number, and one special character."
      );
      return;
    }

    setError("");

    try {
      const registerResponse = await fetch(`/CSE442/2026-Spring/cse-442s/api/register.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, password }),
      });

      const registerData = await registerResponse.json();

      if (!registerResponse.ok || !registerData.success) {
        setError(registerData.message || "We could not create your account. Please try again.");
        return;
      }

      const verifyResponse = await fetch(`/CSE442/2026-Spring/cse-442s/api/verify.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, id: registerData.user_id }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.success) {
        setError(
          verifyData.message ||
            "Your account was created, but we could not send a verification email. Please try logging in and request a new one."
        );
        return;
      }

      setSubmittedEmail(trimmedEmail);
    } catch (err) {
      setError("We are unable to create your account right now. Please try again later.");
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
        {submittedEmail ? (
          <>
            <h2 className="auth-title">Check your email</h2>
            <p className="auth-success" role="status">
              We sent a verification link to <strong>{submittedEmail}</strong>.
              Open it to finish setting up your account, then log in.
            </p>
            <Link to="/login" className="login-link-button">Back to Log in</Link>
          </>
        ) : (
          <>
            <h2 className="auth-title">Register</h2>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <label className="auth-label">Username</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Jane Smith"
                value={username}
                onChange={(e) =>
                  handleLimitedChange(e.target.value, setUsername, "Username", USERNAME_MAX_LENGTH)
                }
                maxLength={USERNAME_MAX_LENGTH}
                autoComplete="username"
              />

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

              <label className="auth-label">Confirm Password</label>
              <div className="password-wrapper">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="••••"
                  value={confirmPassword}
                  onChange={(e) =>
                    handleLimitedChange(
                      e.target.value,
                      setConfirmPassword,
                      "Confirm password",
                      PASSWORD_MAX_LENGTH
                    )
                  }
                  maxLength={PASSWORD_MAX_LENGTH}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>

              <Link to="/login" className="login-link-button">Already Registered? Log In</Link>
              <Link to="/verify" className="login-link-button">Are you a Professor? Sign up here</Link>

              {(limitError || error) && (
                <div className="auth-error" role="alert">
                  {limitError || error}
                </div>
              )}

              <button type="submit" className="auth-button">Submit</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
