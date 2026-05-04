import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './BundlePage.css';
import Navbar from '../Navbar/Navbar';

function ItemCarousel({ images, onImageClick }) {
  const [index, setIndex] = useState(0);
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;
  const next = () => hasNext && setIndex(index + 1);
  const prev = () => hasPrev && setIndex(index - 1);

  return (
    <div className="bundle-carousel-container">
      <img
        src={images[index]}
        alt="item"
        className="bundle-carousel-img"
        onClick={() => onImageClick?.(images[index], index)}
      />
      {hasPrev && <button className="bundle-carousel-arrow left" onClick={prev}>‹</button>}
      {hasNext && <button className="bundle-carousel-arrow right" onClick={next}>›</button>}
    </div>
  );
}

function BundlePage() {
  const [bundle, setBundle] = useState(null);
  const [bundleError, setBundleError] = useState("");
  const [rating, setRating] = useState("N/A");
  const [editingPrice, setEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [priceError, setPriceError] = useState("");
  const [currentPriceOverride, setCurrentPriceOverride] = useState(null);

  // NEW: State for deletion
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const location = useLocation();
  const navigate = useNavigate();
  const bundleId = location.state?.bundleId;

  const [itemImages, setItemImages] = useState({});
  const [fullscreenImages, setFullscreenImages] = useState([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  useEffect(() => {
    if (!bundleId) return;
    const token = localStorage.getItem("token");
    fetch(`/CSE442/2026-Spring/cse-442s/api/get_bundle.php?bundle_id=${bundleId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data?.message) {
          setBundleError(data.message);
          return;
        }
        setBundle({ ...data, items: Array.isArray(data.items) ? data.items : [] });
      })
      .catch(err => {
        console.error("Failed to fetch bundle", err);
        setBundleError("Failed to load bundle.");
      });
  }, [bundleId]);

  useEffect(() => {
    if (!bundle?.username) return;
    fetch("/CSE442/2026-Spring/cse-442s/api/fetch_rating.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: bundle.username })
    })
      .then(res => res.json())
      .then(data => { if (data?.rating) setRating(data.rating); })
      .catch(() => setRating("N/A"));
  }, [bundle?.username]);

  useEffect(() => {
    if (!bundle?.items) return;
    const token = localStorage.getItem("token");
    bundle.items.forEach(item => {
      fetch(`/CSE442/2026-Spring/cse-442s/api/get_listing_images.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: item.id })
      })
        .then(res => res.json())
        .then(images => {
          setItemImages(prev => ({
            ...prev,
            [item.id]: images.length > 0 ? images : [item.image]
          }));
        })
        .catch(() => {
          setItemImages(prev => ({ ...prev, [item.id]: [item.image] }));
        });
    });
  }, [bundle]);

  const handleSavePrice = async () => {
    const parsed = parseFloat(newPrice);
    if (newPrice === "" || isNaN(parsed) || parsed < 0) {
      setPriceError("Enter a valid price.");
      return;
    }
    const rounded = parseFloat(parsed.toFixed(2));
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/CSE442/2026-Spring/cse-442s/api/edit_bundle_price.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bundle_id: bundle.id, price: rounded }),
      });
      const data = await res.json();
      if (!res.ok) { setPriceError(data.message || "Failed to update price."); return; }
      setCurrentPriceOverride(rounded);
      setEditingPrice(false);
      setPriceError("");
    } catch {
      setPriceError("Network error. Try again.");
    }
  };

  // NEW: Handler for Deleting Bundle
  const handleDeleteBundle = async () => {
    const token = localStorage.getItem("token");
    setDeleteError("");
    try {
      const res = await fetch("/CSE442/2026-Spring/cse-442s/api/delete_bundle.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ bundle_id: bundle.id })
      });
      const data = await res.json();
      if (res.ok) {
        navigate(`/store/${bundle.username}`);
      } else {
        setDeleteError(data.message || "Failed to delete bundle.");
      }
    } catch (err) {
      setDeleteError("Network error. Try again later.");
    }
  };

  if (bundleError) return <div className="bundle-loading">{bundleError}</div>;
  if (!bundle) return <div className="bundle-loading">Loading bundle...</div>;

  const itemsTotal = bundle.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
  let totalPrice = itemsTotal;
  if (currentPriceOverride !== null) {
    totalPrice = currentPriceOverride;
  } else if (
    bundle.price_override !== null &&
    bundle.price_override !== undefined &&
    bundle.price_override !== "null" &&
    bundle.price_override !== ""
  ) {
    totalPrice = parseFloat(bundle.price_override);
  }

  const loggedInUser = localStorage.getItem("username");
  const isOwner = loggedInUser === bundle.username;

  return (
    <div className="listing-page-wrapper">
      <Navbar />
      <main className="bundle-container">
        <div className="bundle-header">
          <h1 className="bundle-title">{bundle.title}</h1>
          <div className="bundle-badge">Bundle</div>
        </div>

        <div className="bundle-total-bar">
          <span>Total Price</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {editingPrice ? (
              <>
                <input
                  type="number"
                  className="price-edit-input"
                  value={newPrice}
                  min="0"
                  step="0.01"
                  onChange={(e) => { setNewPrice(e.target.value); setPriceError(""); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePrice()}
                  autoFocus
                  style={{ width: '100px' }}
                />
                <button className="price-save-btn" onClick={handleSavePrice}>Save</button>
                <button className="price-cancel-btn" onClick={() => { setEditingPrice(false); setPriceError(""); }}>Cancel</button>
                {priceError && <span className="price-error">{priceError}</span>}
              </>
            ) : (
              <>
                <span className="bundle-total-price">${totalPrice.toFixed(2)}</span>
                {isOwner && (
                  <button className="edit-price-btn" onClick={() => { setNewPrice(totalPrice.toFixed(2)); setEditingPrice(true); }}>
                    <span className="material-symbols-outlined">edit</span> Edit Price
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <h3 className="bundle-items-heading">Items in this Bundle</h3>

        <div className="bundle-items-list">
          {bundle.items.map(item => (
            <div key={item.id} className="bundle-item-card">
              <ItemCarousel
                images={itemImages[item.id] || [item.image]}
                onImageClick={(src, idx) => {
                  const images = itemImages[item.id] || [item.image];
                  setFullscreenImages(images);
                  setFullscreenIndex(idx);
                  setIsFullscreenOpen(true);
                }}
              />
              <div className="bundle-item-info">
                <div className="bundle-item-title">{item.title}</div>
                {item.description && <div className="bundle-item-desc">{item.description}</div>}
              </div>
              <div className="bundle-item-price">${parseFloat(item.price || 0).toFixed(2)}</div>
            </div>
          ))}
        </div>

        {isFullscreenOpen && (
          <div className="fullscreen-overlay" onClick={() => setIsFullscreenOpen(false)}>
            <div className="fullscreen-inner" onClick={(e) => e.stopPropagation()}>
              <button className="fullscreen-close-btn" onClick={() => setIsFullscreenOpen(false)}>×</button>
              {fullscreenImages.length > 1 && (
                <button className="fullscreen-nav left" onClick={(e) => { e.stopPropagation(); setFullscreenIndex((prev) => Math.max(prev - 1, 0)); }}>‹</button>
              )}
              <img src={fullscreenImages[fullscreenIndex]} alt="Full screen item" className="fullscreen-image" />
              {fullscreenImages.length > 1 && (
                <button className="fullscreen-nav right" onClick={(e) => { e.stopPropagation(); setFullscreenIndex((prev) => Math.min(prev + 1, fullscreenImages.length - 1)); }}>›</button>
              )}
              {fullscreenImages.length > 1 && <div className="fullscreen-counter">{fullscreenIndex + 1}/{fullscreenImages.length}</div>}
            </div>
          </div>
        )}

        {/* Updated Action Area */}
        {deleteError && (
          <div className="listing-error-box" role="alert" style={{ marginBottom: '15px' }}>{deleteError}</div>
        )}

        {isOwner ? (
          <button className="delete-listing-btn" style={{ width: '100%', maxWidth: 'none' }} onClick={() => setShowConfirmDelete(true)}>
            Delete Bundle
          </button>
        ) : (
          <button className="action-btn" onClick={() => navigate('/inbox', { state: { bundle: { id: bundle.id, title: bundle.title } } })}>
            Message / Make Offer
          </button>
        )}

        <div className="info-card">
          <h4>Seller Information</h4>
          <div className="seller-content">
            <div className="seller-profile">
              {bundle.profile_photo ? (
                <img src={bundle.profile_photo} className="seller-avatar-img" alt={bundle.username} />
              ) : (
                <div className="seller-avatar-default">{bundle.username ? bundle.username[0].toUpperCase() : '?'}</div>
              )}
              <div>
                <div style={{ fontWeight: 'bold' }}>{bundle.username}</div>
                <div className="seller-rating" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#f5a623', fontVariationSettings: "'FILL' 1" }}>star</span>
                  {rating === "N/A" ? "N/A" : `${rating} / 5`}
                </div>
              </div>
            </div>
            <button className="view-profile-btn" onClick={() => navigate(`/store/${encodeURIComponent(bundle.username)}`)}>View Store</button>
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmDelete && (
        <div className="modal-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Deletion</h2>
            <p>Are you sure you want to delete the bundle <strong>{bundle.title}</strong>? The individual items will still exist in your store.</p>
            <button 
              className="modal-submit" 
              style={{ backgroundColor: '#e53935' }} 
              onClick={() => { setShowConfirmDelete(false); handleDeleteBundle(); }}
            >
              Yes, Delete Bundle
            </button>
            <button className="modal-cancel" onClick={() => setShowConfirmDelete(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BundlePage;
