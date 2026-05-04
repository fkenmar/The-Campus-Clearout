import React, { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams, useNavigate } from "react-router-dom";
import "../Style/AuthStyle.css";
import ccLogo from "../Assets/CampusClearoutLogo.png";

const STRONG_PASSWORD_ERROR =
  "Password must be at least 8 characters and include one uppercase, one lowercase, one number, and one special character.";

const resetPasswordMessages = {
  "Missing token": "This password reset link is missing required information.",
  "Missing reset token.": "This password reset link is missing required information.",
  "Invalid or expired token": "This password reset link is invalid or has expired.",
  "Invalid or expired reset link.": "This password reset link is invalid or has expired.",
  "Token and passwords are required": "Please enter and confirm your new password.",
  "Passwords do not match": "The passwords entered do not match.",
  "Password must be at least 8 characters": STRONG_PASSWORD_ERROR,
  "Password does not meet requirements": STRONG_PASSWORD_ERROR,
  "Password reset failed": "We could not update your password. Please try again.",
  "Password reset successful": "Your password has been updated. Redirecting you to login...",
  "Database connection failed": "We are unable to process your request right now. Please try again later.",
  "Invalid request": "We could not process this request. Please refresh the page and try again.",
};

const getResetPasswordMessage = (message, fallback) =>
  resetPasswordMessages[message] || message || fallback;

const PASSWORD_MAX_LENGTH = 128;

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [tokenValid, setTokenValid] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const token = searchParams.get("token");
  const isLoggedIn = !!localStorage.getItem("token");

  useEffect(() => {
    if (isLoggedIn) return;

    const validateToken = async () => {
      if (!token) {
        setError("This password reset link is missing required information.");
        setTokenValid(false);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/CSE442/2026-Spring/cse-442s/api/reset_token.php?token=${encodeURIComponent(token)}`
        );

        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(
            getResetPasswordMessage(
              data.message,
              "This password reset link is invalid or has expired."
            )
          );
          setTokenValid(false);
          setLoading(false);
          return;
        }

        setUsername(data.username || "");
        setTokenValid(true);
      } catch (err) {
        setError("We are unable to validate this link right now. Please try again later.");
        setTokenValid(false);
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token, isLoggedIn]);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setMsg("");

    if (!password || !confirmPassword) {
      setError("Please enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords entered do not match.");
      return;
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).{8,}$/;
    if (!passwordRegex.test(password)) {
      setError(STRONG_PASSWORD_ERROR);
      return;
    }

    try {
      const res = await fetch(
        "/CSE442/2026-Spring/cse-442s/api/reset_password.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            password,
            confirmPassword,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(
          getResetPasswordMessage(
            data.message,
            "We could not update your password. Please try again."
          )
        );
        return;
      }

      setMsg(
        getResetPasswordMessage(
          data.message,
          "Your password has successfully been updated. Redirecting you to login..."
        )
      );
      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err) {
      setError("We are unable to update your password right now. Please try again later.");
    }
  };

  if (isLoggedIn) {
    return <Navigate to="/homepage" replace />;
  }

  return (
    <div className="auth-container">
      <div className="auth-brand">
        <Link to="/">
          <img src={ccLogo} alt="Campus Clearout" className="auth-brand-logo" />
        </Link>
      </div>

      <div className="auth-card">
        <h2 className="auth-title">Reset Password</h2>

        {loading ? (
          <p className="auth-subtext">Loading...</p>
        ) : !tokenValid ? (
          <>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Link to="/forgot-password" className="login-link-button">
              Request a new reset link
            </Link>
            <Link to="/login" className="login-link-button">
              Back to Log in
            </Link>
          </>
        ) : (
          <form onSubmit={handleResetPassword} className="auth-form">
            {username && (
              <p className="auth-subtext" style={{ marginTop: 0 }}>
                Resetting password for <strong>{username}</strong>.
              </p>
            )}

            <label className="auth-label">New Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                className="auth-input"
                placeholder="••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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

            <label className="auth-label">Confirm New Password</label>
            <div className="password-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                className="auth-input"
                placeholder="••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
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

            <Link to="/login" className="login-link-button">Back to Log in</Link>

            {error && <p className="auth-error" role="alert">{error}</p>}
            {msg && <p className="auth-success" role="status">{msg}</p>}

            <button type="submit" className="auth-button">Update Password</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
