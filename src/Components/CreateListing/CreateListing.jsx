import { useState, useRef, useEffect } from 'react';
import './CreateListing.css';

const TITLE_MAX_LENGTH = 100;
const PRICE_MAX_LENGTH = 10;
const QUANTITY_MAX_LENGTH = 5;
const DESCRIPTION_MAX_LENGTH = 300;
const DETAILS_MAX_LENGTH = 300;

const getLimitMessage = (field, max) =>
  `${field} has reached the ${max}-character limit.`;

function CreateListing({ onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [desc, setDesc] = useState("");
  const [details, setDetails] = useState("");
  const [images, setImages] = useState([null]);          // array of File objects
  const [imagePreviews, setImagePreviews] = useState([null]); // array of preview URLs
  const [formError, setFormError] = useState("");
  const [limitError, setLimitError] = useState("");
  const [courses, setCourses] = useState([]);
  const [coursesError, setCoursesError] = useState("");
  const [selectedCourseTag, setSelectedCourseTag] = useState("");

  // NEW — bundle toggle
  const [isBundle, setIsBundle] = useState(false);
  const [bundleError, setBundleError] = useState("");

  // NEW — user's listings
  const [availableItems, setAvailableItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  const toggleBundleItem = (id) => {
    setSelectedItems(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  // fetch user's active listings ONLY when bundle mode is on
  useEffect(() => {
    if (!isBundle) return;

    const token = localStorage.getItem("token");

    fetch("/CSE442/2026-Spring/cse-442s/api/my_active_listings.php", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setAvailableItems(data);
      })
      .catch(err => console.error("Failed to fetch listings", err));
  }, [isBundle]);

  const allTags = ["Small", "Medium", "Large", "North Campus", "South Campus", "Downtown Campus"];
  const [selectedTags, setSelectedTags] = useState([]);

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
          setCoursesError(
            data?.error ||
            data?.message ||
            "We could not load available course tags. You can still post without one."
          );
          return;
        }

        setCourses(normalizeCoursePayload(data));
        setCoursesError("");
      })
      .catch((err) => {
        console.error("Failed to fetch courses:", err);
        setCourses([]);
        setCoursesError(
          "We could not load available course tags. You can still post without one."
        );
      });
  }, []);

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const fileRef = useRef(null);

  const handleSubmit = async () => {
    setFormError("");
    setBundleError("");
    setLimitError("");

    if (isBundle && !title) {
      setBundleError("Please enter a bundle title before posting.");
      return;
    }

    if (!isBundle) {
      if (!title || !price || !quantity) {
        setFormError("Please enter a title, price, and quantity, and upload an image before posting.");
        return;
      }

      if (Number(quantity) < 1) {
        setFormError("Quantity must be a number greater than or equal to 1.");
        return;
      }

      // Filter out null placeholders
      const filteredImages = images.filter(img => img !== null);

      if (filteredImages.length === 0) {
        setFormError("Please upload at least one image.");
        return;
      }

      // Update state properly
      setImages(filteredImages);

      // Use filteredImages directly for submission
      await onSubmit({
        title,
        price,
        quantity,
        description: desc,
        images: filteredImages,
        tags: selectedCourseTag ? [...selectedTags, selectedCourseTag] : selectedTags,
        bundleItems: selectedItems
      });

      onClose();
      return;
    }

    // BUNDLE MODE SUBMISSION
    await onSubmit({
      title,
      price,
      quantity,
      description: desc,
      images: [], // bundles don't upload images
      tags: selectedCourseTag ? [...selectedTags, selectedCourseTag] : selectedTags,
      bundleItems: selectedItems
    });

    onClose();
  };

  const handleLimitedChange = (value, setter, field, max) => {
    setter(value);
    setLimitError(value.length === max ? getLimitMessage(field, max) : "");
  };

  const handleImageChange = (index, file) => {
    const validTypes = ["image/jpeg", "image/png"];
    const MAX_FILE_SIZE = 2 * 1024 * 1024; // Exactly 2MB

    if (!validTypes.includes(file.type)) {
      setFormError("Please upload a valid Image file (Accepted formats: .jpg, .png)");
      return;
    }

    // NEW: The 2MB Frontend Shield
    if (file.size > MAX_FILE_SIZE) {
      setFormError("This image is too large. The server limit is exactly 2MB.");
      return;
    }

    // Clear any previous errors if the file is good
    setFormError("");

    setImages(prev => {
      const updated = [...prev];
      updated[index] = file;
      return updated;
    });

    setImagePreviews(prev => {
      const updated = [...prev];
      updated[index] = URL.createObjectURL(file);
      return updated;
    });
  };

  const handleDeleteImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };


  return (
    <div className="cl-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cl-page">
        <button className="cl-close" onClick={onClose}>✕</button>

        <h1 className="cl-title">Create New Listing</h1>

        {limitError && (
          <div className="cl-error" role="alert">
            {limitError}
          </div>
        )}

        {/* NEW TOGGLE */}
        <div className="cl-toggle">
          <button
            className={`cl-toggle-btn ${!isBundle ? "active" : ""}`}
            onClick={() => setIsBundle(false)}
            type="button"
          >
            Single
          </button>

          <button
            className={`cl-toggle-btn ${isBundle ? "active" : ""}`}
            onClick={() => setIsBundle(true)}
            type="button"
          >
            Bundle
          </button>
        </div>

        {/* BUNDLE ITEM SELECTOR */}
        {isBundle && (
          <div className="cl-section">
            <div className="cl-label">Your Active Listings</div>

            {availableItems.map(item => (
              <label key={item.id} className="cl-bundle-card">
                <input
                  type="checkbox"
                  checked={selectedItems.includes(item.id)}
                  onChange={() => toggleBundleItem(item.id)}
                  className="cl-bundle-checkbox"
                />

                <div className="cl-bundle-card-content">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="cl-bundle-card-img"
                  />

                  <div className="cl-bundle-card-text">
                    <div className="cl-bundle-card-title">{item.title}</div>
                    <div className="cl-bundle-card-username">{item.username}</div>
                    {item.description && (
                      <div className="cl-bundle-card-desc">{item.description}</div>
                    )}
                    <div className="cl-bundle-card-price">${item.price}</div>
                  </div>
                </div>
              </label>
            ))}


            <div className="cl-selected-count">
              Items Selected: {selectedItems.length}
            </div>
          </div>
        )}

        <div className="cl-row">
          <input
            className={`cl-input ${bundleError ? "cl-error-border" : ""}`}
            placeholder={isBundle ? "Bundle Title" : "Add Title"}
            value={title}
            onChange={(e) => {
              handleLimitedChange(e.target.value, setTitle, "Title", TITLE_MAX_LENGTH);
              if (bundleError) setBundleError("");
            }}
            maxLength={TITLE_MAX_LENGTH}
          />

          {!isBundle && (

            <input
              className="cl-input"
              placeholder="Add Price ($)"
              value={price}
              onChange={(e) => {
                const value = e.target.value;
                // Allow ONLY digits (no letters, no negatives, no decimals)
                if (/^\d*$/.test(value)) {
                  handleLimitedChange(value, setPrice, "Price", PRICE_MAX_LENGTH);
                }
              }}
              maxLength={PRICE_MAX_LENGTH}
            />

          )}

          {!isBundle && (
            <div className="cl-row">
              <input
                className="cl-input"
                placeholder="Add Quantity"
                value={quantity}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow ONLY digits (no letters, no negatives, no decimals)
                  if (/^\d*$/.test(value)) {
                    handleLimitedChange(value, setQuantity, "Quantity", QUANTITY_MAX_LENGTH);
                  }
                }}
                maxLength={QUANTITY_MAX_LENGTH}
              />
            </div>
          )}

        </div>

        {bundleError && (
          <div className="cl-error" role="alert">
            {bundleError}
          </div>
        )}

        {!isBundle && (
          <>
            <textarea className="cl-textarea cl-description" placeholder="Add Description" value={desc} onChange={(e) => handleLimitedChange(e.target.value, setDesc, "Description", DESCRIPTION_MAX_LENGTH)} maxLength={DESCRIPTION_MAX_LENGTH} />

            <div className="cl-section">
              <div className="cl-label">Tags</div>
              <div className="cl-tag-row">
                {allTags.map(tag => (
                  <label key={tag} className={`cl-tag-checkbox${selectedTags.includes(tag) ? ' cl-tag-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </div>

            <div className="cl-section">
              <div className="cl-label">Class Materials Tag</div>
              <select
                className="cl-select"
                value={selectedCourseTag}
                onChange={(e) => setSelectedCourseTag(e.target.value)}
              >
                <option value="">No class materials tag</option>
                {courses.map((course, index) => {
                  const title = course.title || "Untitled course";
                  const tag = `Class Materials: ${title}`;
                  return (
                    <option key={course.id ?? `${title}-${index}`} value={tag}>
                      {title}
                    </option>
                  );
                })}
              </select>
              {coursesError && (
                <div className="cl-helper-error" role="alert">
                  {coursesError}
                </div>
              )}
            </div>

            <div className="cl-section cl-upload-section">
              <div className="cl-label">Upload Pictures</div>

              <div className="cl-upload-multi-container">
                {imagePreviews.map((preview, index) => (
                  <div
                    key={index}
                    className="cl-upload-area"
                    onClick={() => document.getElementById(`file-${index}`).click()}
                  >
                    {preview ? (
                      <>
                        <img src={preview} className="cl-upload-preview" />

                        <button
                          type="button"
                          className="cl-delete-img-btn"
                          onClick={(e) => {
                            e.stopPropagation(); // prevents opening file picker
                            handleDeleteImage(index);
                          }}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <span className="cl-upload-plus">+</span>
                    )}

                    <input
                      id={`file-${index}`}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) handleImageChange(index, file);
                        e.target.value = ""; // NEW: Instantly clears the value so re-uploads trigger onChange
                      }}
                    />
                  </div>
                ))}


                <button
                  type="button"
                  className="cl-add-photo-btn"
                  onClick={() => {
                    setImages(prev => [...prev, null]);
                    setImagePreviews(prev => [...prev, null]);
                  }}
                >
                  + Add Photo
                </button>
              </div>
            </div>

            {/* <textarea className="cl-textarea cl-details" placeholder="Additional Details About Listing" value={details} onChange={(e) => handleLimitedChange(e.target.value, setDetails, "Additional details", DETAILS_MAX_LENGTH)} maxLength={DETAILS_MAX_LENGTH} /> */}
          </>
        )}

        {formError && (
          <div className="cl-error" role="alert">
            {formError}
          </div>
        )}

        <div className="cl-footer">
          <button className="cl-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="cl-create-btn" onClick={handleSubmit}>Post Listing</button>
        </div>
      </div>
    </div>
  );
}

export default CreateListing;