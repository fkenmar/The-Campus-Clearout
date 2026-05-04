import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { UnreadContext } from '../../App';
import './Store.css';
import '../HomePage/HomePage.css'; // grid and card styles
import Navbar from '../Navbar/Navbar';

// exact ProductCard from HomePage
function ProductCard({ image, title, price, username, profilePhoto, description, onClick }) {
  return (
    <div className="product-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="card-user-info">
        {profilePhoto ? (
          <img src={profilePhoto} className="card-avatar" alt={username} onError={(e) => e.target.style.display = 'none'} />
        ) : (
          <div className="card-avatar-default">
            {username ? username[0].toUpperCase() : '?'}
          </div>
        )}
        <span className="card-username">{username || "Unknown"}</span>
      </div>
      <div className="card-image-box">
        {image ? (
          <img src={image} alt={title} onError={(e) => e.target.src = 'https://via.placeholder.com/200'} />
        ) : (
          <span className="material-symbols-outlined placeholder-icon">image</span>
        )}
      </div>
      <div className="card-text">
        <h3>{title}</h3>
        {description && <p className="card-description">{description}</p>}
        <p className="card-price">${Number(price).toFixed(2)}</p>
      </div>
    </div>
  );
}

function Store() {
  const { username } = useParams(); // Gets the username from the URL (e.g., /store/seller2)
  const navigate = useNavigate();
  const unreadCount = useContext(UnreadContext);
  
  const [storeData, setStoreData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const loggedInUser = localStorage.getItem("username");

  useEffect(() => {
    const fetchStoreData = async () => {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");

      try {
        const response = await fetch(`/CSE442/2026-Spring/cse-442s/api/get_store.php?username=${encodeURIComponent(username)}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.status === 401) {
          navigate("/");
          return;
        }

        const data = await response.json();

        if (response.ok) {
          setStoreData(data);
        } else {
          setError(data.message || "Store not found");
        }
      } catch (err) {
        setError("Failed to load store data.");
      } finally {
        setLoading(false);
      }
    };

    fetchStoreData();
  }, [username, navigate]);

  const handleLogout = async () => {
    const token = localStorage.getItem("token");
    try {
      await fetch(`/CSE442/2026-Spring/cse-442s/api/logout.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch (err) {}
    localStorage.removeItem("token");
    localStorage.removeItem("token_expires");
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    navigate("/");
  };

  if (loading) return <div className="store-loading">Loading store...</div>;
  if (error) return <div className="store-error"><h2>{error}</h2><button onClick={() => navigate('/homepage')} className="create-listing-btn">Go Home</button></div>;
  if (!storeData) return null;

  const allItems = [
    ...(storeData.active_bundles || []),
    ...(storeData.active_listings || []),
  ];

  // Filter listings + bundles based on the local search bar
  const filteredListings = allItems.filter(listing =>
    listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (listing.description && listing.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="layout-wrapper store-page">
      {/* NAVBAR */}
      
    <Navbar />

      {/* STORE HEADER */}
      <div className="store-header-container">
        <div className="store-profile-section">
          {storeData.profile.profile_photo ? (
            <img src={storeData.profile.profile_photo} alt={storeData.profile.username} className="store-avatar-large" />
          ) : (
            <div className="store-avatar-large default-avatar">
              {storeData.profile.username[0].toUpperCase()}
            </div>
          )}
          <div className="store-info">
            <h1>{storeData.profile.username}'s Store</h1>
            <div className="store-rating-badge">
              <span className="material-symbols-outlined star-icon">star</span>
              <span className="rating-score">{storeData.stats.average_rating}</span>
              <span className="rating-count">({storeData.stats.total_reviews} reviews)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="content-container store-content">
        {/* LEFT COLUMN: LISTINGS */}
        <div className="store-listings-section">
          <div className="search-toolbar">
            <h2>Active Listings ({storeData.active_listings.length})</h2>
            <div className="search-input-wrapper" style={{ maxWidth: '300px', marginRight: 0 }}>
              <input
                type="text"
                placeholder={`Search ${storeData.profile.username}'s items...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="material-symbols-outlined search-icon">search</span>
            </div>
          </div>

          <div className="listings-grid">
            {filteredListings.length > 0 ? (
              filteredListings.map((p) => (
                <ProductCard
                  key={`${p.is_bundle ? 'bundle' : 'listing'}-${p.id}`}
                  title={p.title}
                  price={p.price}
                  description={p.description}
                  image={p.image}
                  username={storeData.profile.username}
                  profilePhoto={storeData.profile.profile_photo}
                  onClick={() => p.is_bundle
                    ? navigate("/bundlepage", { state: { bundleId: p.id } })
                    : navigate("/listingpage", { state: { product: { ...p, username: storeData.profile.username, profile_photo: storeData.profile.profile_photo } } })
                  }
                />
              ))
            ) : (
              <div className="empty-state">No listings match your search.</div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: REVIEWS */}
        <aside className="store-reviews-section">
          <h2>Reviews</h2>
          {storeData.reviews.length > 0 ? (
            <div className="reviews-feed">
              {storeData.reviews.map(review => (
                <div key={review.id} className="review-card">
                  <div className="review-header">
                    {review.reviewer_photo ? (
                      <img src={review.reviewer_photo} alt={review.reviewer} className="review-avatar" />
                    ) : (
                      <div className="review-avatar default-avatar">{review.reviewer[0].toUpperCase()}</div>
                    )}
                    <div className="review-meta">
                      <span className="reviewer-name">{review.reviewer}</span>
                      <span className="review-date">{review.date}</span>
                    </div>
                  </div>
                  <div className="review-stars">
                    {[1, 2, 3, 4, 5].map(star => (
                      <span key={star} className={`material-symbols-outlined ${star <= review.score ? 'filled' : 'empty'}`}>star</span>
                    ))}
                  </div>
                  {review.text && <p className="review-text">{review.text}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px' }}>No reviews yet.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default Store;
