import React, { useState, useEffect, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UnreadContext } from '../../App';
import './ListingPage.css';
import Navbar from '../Navbar/Navbar';

function ListingPage() {
  const PRICE_MAX_LENGTH = 10;
  const QUANTITY_MAX_LENGTH = 5;
  const unreadCount = useContext(UnreadContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [priceError, setPriceError] = useState("");
  const [currentPrice, setCurrentPrice] = useState(null);

  const [editingQuantity, setEditingQuantity] = useState(false);
  const [newQuantity, setNewQuantity] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [currentQuantity, setCurrentQuantity] = useState(null);
  const [editingCourse, setEditingCourse] = useState(false);
  const [newCourseTag, setNewCourseTag] = useState("");
  const [courseError, setCourseError] = useState("");
  const [currentTags, setCurrentTags] = useState(null);
  const [courses, setCourses] = useState([]);
  const [coursesError, setCoursesError] = useState("");

  const [allImages, setAllImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();

  const [deleteError, setDeleteError] = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const product = location.state?.product || {
    title: "Listing",
    price: 0,
    quantity: 1,
    description: "",
    username: "Unknown",
    image: null,
    tags: "",
  };

  const [rating, setRating] = useState("N/A");

  useEffect(() => {
    if (!product?.username) return;

    fetch("/CSE442/2026-Spring/cse-442s/api/fetch_rating.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: product.username })
    })
      .then(res => res.json())
      .then(data => {
        if (data?.rating) setRating(data.rating);
      })
      .catch(() => setRating("N/A"));
  }, [product.username]);

  useEffect(() => {
    if (!product?.id) return;

    fetch("/CSE442/2026-Spring/cse-442s/api/get_listing_images.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: product.id })
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAllImages(data);
        } else {
          setAllImages(product.image ? [product.image] : []);
        }
      })
      .catch(() => {
        setAllImages(product.image ? [product.image] : []);
      });
  }, [product.id]);

  const isOwner = localStorage.getItem("username") === product.username;
  const displayPrice =
    currentPrice !== null
      ? Number(currentPrice).toFixed(2)
      : Number(product.price).toFixed(2);
  const displayQuantity =
    currentQuantity !== null ? currentQuantity : (product.quantity ?? 1);
  const classMaterialsPrefix = "Class Materials:";
  const listingTags = currentTags !== null ? currentTags : (product.tags || product.tag || "");
  const tagList = listingTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const classMaterialsTag = tagList.find((tag) => tag.startsWith(classMaterialsPrefix));
  const courseName = classMaterialsTag
    ? classMaterialsTag.slice(classMaterialsPrefix.length).trim()
    : "";
  const courseLink = "/courses";

  const normalizeCoursePayload = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.courses)) return data.courses;
    return [];
  };

  useEffect(() => {
    const token = localStorage.getItem("token");

    fetch("/CSE442/2026-Spring/cse-442s/api/courselistings.php", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        let data = null;

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          setCourses([]);
          setCoursesError("Could not load available courses.");
          return;
        }

        if (!res.ok) {
          setCourses([]);
          setCoursesError(data?.error || data?.message || "Could not load available courses.");
          return;
        }

        setCourses(normalizeCoursePayload(data));
        setCoursesError("");
      })
      .catch((err) => {
        console.error("Failed to fetch courses:", err);
        setCourses([]);
        setCoursesError("Could not load available courses.");
      });
  }, []);

  const handleEditPrice = () => {
    setNewPrice(currentPrice !== null ? currentPrice : product.price);
    setPriceError("");
    setEditingPrice(true);
  };

  const handleCancelEdit = () => {
    setEditingPrice(false);
    setPriceError("");
  };

  const handlePriceInput = (e) => {
    const val = e.target.value;
    if (val.length > PRICE_MAX_LENGTH) {
      setPriceError(`Price has reached the ${PRICE_MAX_LENGTH}-character limit.`);
      return;
    }
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      setNewPrice(val);
      setPriceError(val.length === PRICE_MAX_LENGTH ? `Price has reached the ${PRICE_MAX_LENGTH}-character limit.` : "");
    }
  };

  const handleSavePrice = async () => {
    const parsed = parseFloat(newPrice);
    if (newPrice === "" || isNaN(parsed) || parsed < 0) {
      setPriceError("Enter a valid price.");
      return;
    }

    const rounded = parseFloat(parsed.toFixed(2));
    const token = localStorage.getItem("token");

    try {
      const res = await fetch("/CSE442/2026-Spring/cse-442s/api/edit_price.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ listing_id: product.id, price: rounded }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPriceError(data.message || "Failed to update price.");
        return;
      }

      setCurrentPrice(rounded);
      setEditingPrice(false);
      setPriceError("");
      navigate('/listingpage', {
        replace: true,
        state: { product: { ...product, price: rounded } }
      });
    } catch (err) {
      setPriceError("Network error. Try again.");
    }
  };

  const handleEditQuantity = () => {
    setNewQuantity(currentQuantity !== null ? currentQuantity : (product.quantity ?? 1));
    setQuantityError("");
    setEditingQuantity(true);
  };

  const handleCancelQuantityEdit = () => {
    setEditingQuantity(false);
    setQuantityError("");
  };

  const handleQuantityInput = (e) => {
    const val = e.target.value;
    if (val.length > QUANTITY_MAX_LENGTH) {
      setQuantityError(`Quantity has reached the ${QUANTITY_MAX_LENGTH}-character limit.`);
      return;
    }
    if (val === '' || /^\d*$/.test(val)) {
      setNewQuantity(val);
      setQuantityError(val.length === QUANTITY_MAX_LENGTH ? `Quantity has reached the ${QUANTITY_MAX_LENGTH}-character limit.` : "");
    }
  };

  const handleSaveQuantity = async () => {
    const parsed = parseInt(newQuantity, 10);

    if (newQuantity === "" || isNaN(parsed) || parsed < 1) {
      setQuantityError("Quantity must be at least 1.");
      return;
    }

    const token = localStorage.getItem("token");

    try {
      const res = await fetch("/CSE442/2026-Spring/cse-442s/api/edit_quantity.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          listing_id: product.id,
          quantity: parsed
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setQuantityError(data.message || "Failed to update quantity.");
        return;
      }

      setCurrentQuantity(parsed);
      setEditingQuantity(false);
      setQuantityError("");
    } catch (err) {
      console.error(err);
      setQuantityError("Network error. Try again.");
    }
  };

  const handleEditCourse = () => {
    setNewCourseTag(classMaterialsTag || "");
    setCourseError("");
    setEditingCourse(true);
  };

  const handleCancelCourseEdit = () => {
    setEditingCourse(false);
    setCourseError("");
  };

  const handleSaveCourse = async () => {
    const token = localStorage.getItem("token");

    try {
      const res = await fetch("/CSE442/2026-Spring/cse-442s/api/edit_course.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          listing_id: product.id,
          course_tag: newCourseTag,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCourseError(data.message || "Failed to update course.");
        return;
      }

      const nonCourseTags = tagList.filter((tag) => !tag.startsWith(classMaterialsPrefix));
      const updatedTags = newCourseTag ? [...nonCourseTags, newCourseTag].join(",") : nonCourseTags.join(",");

      setCurrentTags(updatedTags);
      setEditingCourse(false);
      setCourseError("");
      navigate('/listingpage', {
        replace: true,
        state: { product: { ...product, tags: updatedTags, tag: updatedTags } }
      });
    } catch (err) {
      console.error(err);
      setCourseError("Network error. Try again.");
    }
  };

  const handleDeleteListing = async () => {
    const token = localStorage.getItem("token");
    setDeleteError(""); 

    try {
      const res = await fetch("/CSE442/2026-Spring/cse-442s/api/delete_listing.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ listing_id: product.id })
      });

      const data = await res.json();

      if (res.ok) {
        navigate(`/store/${encodeURIComponent(product.username)}`);
      } else {
        setDeleteError(data.message || "Failed to delete listing.");
      }
    } catch (err) {
      console.error(err);
      setDeleteError("Network error. Try again later.");
    }
  };

  const renderCourseBadge = () => (
    courseName ? (
      <Link to={courseLink} className="course-used-badge">
        Used for Course: {courseName}
      </Link>
    ) : null
  );

  const renderCourseEditor = () => {
    if (!isOwner) return null;

    if (editingCourse) {
      return (
        <div className="course-edit-row">
          <select
            className="course-edit-select"
            value={newCourseTag}
            onChange={(e) => setNewCourseTag(e.target.value)}
          >
            <option value="">No class materials tag</option>
            {courses.map((course, index) => {
              const title = course.title || "Untitled course";
              const tag = `${classMaterialsPrefix} ${title}`;
              return (
                <option key={course.id ?? `${title}-${index}`} value={tag}>
                  {title}
                </option>
              );
            })}
          </select>
          <button className="price-save-btn" onClick={handleSaveCourse}>Save</button>
          <button className="price-cancel-btn" onClick={handleCancelCourseEdit}>Cancel</button>
          {(courseError || coursesError) && (
            <div className="listing-error-box" role="alert">{courseError || coursesError}</div>
          )}
        </div>
      );
    }

    return (
      <button className="edit-price-btn" onClick={handleEditCourse}>
        <span className="material-symbols-outlined">edit</span> Edit Course
      </button>
    );
  };

  return (
    <div className="listing-page-wrapper">

      <Navbar />

      <main className="listing-container">
        <section className="listing-image-section">
          <div className="mobile-title-block">
            <h1 className="listing-title">{product.title}</h1>
            <div className="course-controls">
              {renderCourseBadge()}
              {renderCourseEditor()}
            </div>

            <div className="mobile-price-row">
              {editingPrice ? (
                <div className="price-edit-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="price-edit-input"
                    value={newPrice}
                    onChange={handlePriceInput}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePrice()}
                    maxLength={PRICE_MAX_LENGTH}
                  />
                  <button className="price-save-btn" onClick={handleSavePrice}>Save</button>
                  <button className="price-cancel-btn" onClick={handleCancelEdit}>Cancel</button>
                  {priceError && <div className="listing-error-box" role="alert">{priceError}</div>}
                </div>
              ) : (
                <div>
                  <div className="price-display-row">
                    <span className="listing-price">${displayPrice}</span>
                    {isOwner && (
                      <button className="edit-price-btn" onClick={handleEditPrice}>
                        <span className="material-symbols-outlined">edit</span> Edit Price
                      </button>
                    )}
                  </div>

                  {editingQuantity ? (
                    <div className="price-edit-row">
                      <input
                        type="text"
                        className="price-edit-input"
                        value={newQuantity}
                        onChange={handleQuantityInput}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveQuantity()}
                        maxLength={QUANTITY_MAX_LENGTH}
                      />
                      <button className="price-save-btn" onClick={handleSaveQuantity}>Save</button>
                      <button className="price-cancel-btn" onClick={handleCancelQuantityEdit}>Cancel</button>
                      {quantityError && <div className="listing-error-box" role="alert">{quantityError}</div>}
                    </div>
                  ) : (
                    <div className="price-display-row" style={{ marginTop: '6px' }}>
                      <p className="description-text" style={{ margin: '0', fontWeight: '600' }}>
                        Quantity: {displayQuantity}
                      </p>
                      {isOwner && (
                        <button className="edit-price-btn" onClick={handleEditQuantity}>
                          <span className="material-symbols-outlined">edit</span> Edit Quantity
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {allImages.length > 0 ? (
            <div className="carousel-container">

              {currentImageIndex > 0 && (
                <button
                  className="carousel-btn left"
                  onClick={() => setCurrentImageIndex(prev => prev - 1)}
                >
                  ‹
                </button>
              )}

              <img
                src={allImages[currentImageIndex]}
                alt={product.title}
                className="main-listing-image"
              />

              {currentImageIndex < allImages.length - 1 && (
                <button
                  className="carousel-btn right"
                  onClick={() => setCurrentImageIndex(prev => prev + 1)}
                >
                  ›
                </button>
              )}

            </div>

          ) : (
            <div className="listing-image-placeholder">
              <span className="material-symbols-outlined">image</span>
            </div>
          )}
        </section>

        <section className="listing-details-section">
          <div className="listing-header desktop-nav">
            <div>
              <h1 className="listing-title">{product.title}</h1>

              {editingPrice ? (
                <div className="price-edit-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="price-edit-input"
                    value={newPrice}
                    onChange={handlePriceInput}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePrice()}
                    autoFocus
                    maxLength={PRICE_MAX_LENGTH}
                  />
                  <button className="price-save-btn" onClick={handleSavePrice}>Save</button>
                  <button className="price-cancel-btn" onClick={handleCancelEdit}>Cancel</button>
                  {priceError && <div className="listing-error-box" role="alert">{priceError}</div>}
                </div>
              ) : (
                <div className="price-display-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span className="listing-price">${displayPrice}</span>
                    <p
                      className="description-text"
                      style={{ margin: '6px 0 0 0', fontWeight: '600' }}
                    >
                      Quantity: {displayQuantity}
                    </p>
                  </div>

                  {isOwner && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '6px'
                      }}
                    >
                      <button className="edit-price-btn" onClick={handleEditPrice}>
                        <span className="material-symbols-outlined">edit</span> Edit Price
                      </button>

                      {editingQuantity ? (
                        <div className="price-edit-row">
                          <input
                            type="text"
                            className="price-edit-input"
                            value={newQuantity}
                            onChange={handleQuantityInput}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveQuantity()}
                            maxLength={QUANTITY_MAX_LENGTH}
                          />
                          <button className="price-save-btn" onClick={handleSaveQuantity}>Save</button>
                          <button className="price-cancel-btn" onClick={handleCancelQuantityEdit}>Cancel</button>
                          {quantityError && <div className="listing-error-box" role="alert">{quantityError}</div>}
                        </div>
                      ) : (
                        <button className="edit-price-btn" onClick={handleEditQuantity}>
                          <span className="material-symbols-outlined">edit</span> Edit Quantity
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="course-controls">
              {renderCourseBadge()}
              {renderCourseEditor()}
            </div>
          </div>

          {deleteError && (
            <div className="listing-error-box" role="alert" style={{ marginBottom: '10px' }}>
              {deleteError}
            </div>
          )}

          {isOwner ? (
            <button
              className="delete-listing-btn desktop-nav"
              onClick={() => setShowConfirmDelete(true)}
            >
              Delete Listing
            </button>
          ) : (
            <button
              className="action-btn desktop-nav"
              onClick={() => navigate('/inbox', { state: { product } })}
            >
              Message / Make Offer
            </button>
          )}

          <div className="mobile-action-row">
            {isOwner ? (
              <button
                className="delete-listing-btn"
                onClick={() => setShowConfirmDelete(true)}
              >
                Delete Listing
              </button>
            ) : (
              <button
                className="action-btn"
                onClick={() => navigate('/inbox', { state: { product } })}
              >
                Message / Make Offer
              </button>
            )}
          </div>

          <div className="info-card">
            <h4>Description</h4>
            <p className="description-text">
              {product.description || "No description provided."}
            </p>

            {tagList.length > 0 && (
              <div className="tags-container" style={{ marginTop: '20px' }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#555' }}>Tags</h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {tagList.map((t, idx) => (
                    <span key={idx} className="listing-tag-pill">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="info-card">
            <h4>Seller Information</h4>
            <div className="seller-content">
              <div className="seller-profile">
                {product.profile_photo ? (
                  <img
                    src={product.profile_photo}
                    className="seller-avatar-img"
                    alt={product.username}
                  />
                ) : (
                  <div className="seller-avatar-default">
                    {product.username ? product.username[0].toUpperCase() : '?'}
                  </div>
                )}

                <div>
                  <div style={{ fontWeight: 'bold' }}>
                    {product.username || "Unknown"}
                  </div>
                  <div className="seller-rating" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span 
                      className="material-symbols-outlined" 
                      style={{ fontSize: '16px', color: '#f5a623', fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                    {rating === "N/A" ? "N/A" : `${rating} / 5`}
                  </div>
                </div>
              </div>

              <button
                className="view-profile-btn"
                onClick={() => navigate(`/store/${encodeURIComponent(product.username)}`)}
              >View Store</button>
            </div>
          </div>
        </section>
      </main>

      {/* Confirmation Modal */}
      {showConfirmDelete && (
        <div className="modal-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Deletion</h2>
            <p>Are you sure you want to delete <strong>{product.title}</strong>? This action cannot be undone.</p>
            <button 
              className="modal-submit" 
              style={{ backgroundColor: '#e53935' }} 
              onClick={() => { 
                setShowConfirmDelete(false); 
                handleDeleteListing(); 
              }}
            >
              Yes, Delete Listing
            </button>
            <button className="modal-cancel" onClick={() => setShowConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default ListingPage;
