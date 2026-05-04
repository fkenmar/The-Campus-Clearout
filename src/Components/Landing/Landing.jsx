import React from "react";
import { Link, Navigate } from "react-router-dom";
import textbookImg from "../Assets/datastructures_text.jpg";
import fridgeImg from "../Assets/minifridge.jpeg";
import ccLogo from "../Assets/CampusClearoutLogo.png";
import "./Landing.css";

export default function Landing() {
  if (localStorage.getItem("token")) return <Navigate to="/homepage" replace />;

  return (
    <div className="landing-root">
      <nav className="landing-nav">
        <Link to="/" className="landing-brand">
          <img src={ccLogo} alt="Campus Clearout" className="landing-logo" />
        </Link>
        <div className="landing-nav-links">
          <Link to="/login" className="landing-nav-link">Log in</Link>
          <Link to="/signup" className="landing-nav-cta">Get started</Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow">For UB students, by UB students</span>
          <h1 className="landing-title">
            Buy, sell, and <span className="landing-title-accent">clear out</span><br />
            right here on campus.
          </h1>
          <p className="landing-sub">
            Campus Clearout is the UB marketplace for textbooks, dorm gear, and everything in between.
            Verified students only, no scams, no shipping, no stress.
          </p>
          <div className="landing-actions">
            <Link to="/signup" className="landing-btn-primary">Create an account</Link>
            <Link to="/login" className="landing-btn-ghost">I already have one</Link>
          </div>

          <div className="landing-meta">
            <div className="landing-meta-item">
              <span className="landing-meta-num">.edu</span>
              <span className="landing-meta-label">verified only</span>
            </div>
            <div className="landing-meta-item">
              <span className="landing-meta-num">0%</span>
              <span className="landing-meta-label">listing fees</span>
            </div>
            <div className="landing-meta-item">
              <span className="landing-meta-num">1</span>
              <span className="landing-meta-label">campus, all in one place</span>
            </div>
          </div>
        </div>

        <div className="landing-preview">
          <div className="landing-preview-card">
            <img
              src={textbookImg}
              alt="Data structures textbook"
              className="landing-preview-img"
            />
            <h3 className="landing-preview-title">Data Structures Textbook</h3>
            <span className="landing-preview-price">$45</span>
          </div>

          <div className="landing-preview-card-2">
            <img
              src={fridgeImg}
              alt="Mini fridge"
              className="landing-preview-img"
            />
            <h3 className="landing-preview-title" style={{ fontSize: "0.85rem" }}>Mini Fridge</h3>
            <span className="landing-preview-price" style={{ fontSize: "0.9rem" }}>$60</span>
          </div>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-features-head">
          <h2 className="landing-features-title">A marketplace that actually feels like campus.</h2>
          <p className="landing-features-sub">
            Built around how students actually trade, in the library, in the dorm hall, between classes.
          </p>
        </div>

        <div className="landing-features-grid">
          <div className="landing-feature">
            <div className="landing-feature-icon">✓</div>
            <h3 className="landing-feature-title">Verified students</h3>
            <p className="landing-feature-desc">
              Every account is linked to a @buffalo.edu address. You're trading with real classmates.
            </p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">$</div>
            <h3 className="landing-feature-title">No listing fees</h3>
            <p className="landing-feature-desc">
              Post as many items as you want. Keep every cent you earn on the sale.
            </p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">◎</div>
            <h3 className="landing-feature-title">Meet on campus</h3>
            <p className="landing-feature-desc">
              Pick a spot in the Union or a residence hall lobby, no shipping labels, no waiting.
            </p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">✉</div>
            <h3 className="landing-feature-title">Built-in messaging</h3>
            <p className="landing-feature-desc">
              Talk to buyers and sellers inside the app. No phone numbers, no sketchy DMs.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-cta-card">
          <div>
            <h2 className="landing-cta-title">Ready to clear out your dorm?</h2>
            <p className="landing-cta-sub">
              Sign up with your UB email and post your first listing in under a minute.
            </p>
          </div>
          <Link to="/signup" className="landing-cta-btn">Join Campus Clearout</Link>
        </div>
      </section>

      <footer className="landing-foot">
        <span>© Campus Clearout · University at Buffalo</span>
        <div className="landing-foot-links">
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/forgot-password">Reset password</Link>
        </div>
      </footer>
    </div>
  );
}
