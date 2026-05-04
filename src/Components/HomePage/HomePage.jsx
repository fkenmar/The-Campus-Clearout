import './HomePage.css';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CreateListing from '../CreateListing/CreateListing';
import Navbar from '../Navbar/Navbar';

function ProductCard({
  id,
  image,
  title,
  price,
  username,
  profilePhoto,
  description,
  onClick,
  isSaved,
  onToggleSave,
  isBundle
}) {
  return (
    <div className={`product-card ${isBundle ? 'bundle-card' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="card-user-info">
        {profilePhoto ? (
          <img
            src={profilePhoto}
            className="card-avatar"
            alt={username}
            onError={(e) => e.target.style.display = 'none'}
          />
        ) : (
          <div className="card-avatar-default">
            {username ? username[0].toUpperCase() : '?'}
          </div>
        )}
        <span className="card-username">{username || "Unknown"}</span>
      </div>

      <div className="card-image-box">
        {Array.isArray(image) ? (
          <div className="bundle-collage">
            {image.slice(0, 4).map((item, index) => (
              <img
                key={index}
                src={typeof item === "string" ? item : item.image}
                className="bundle-collage-img"
                alt=""
              />
            ))}
          </div>
        ) : image ? (
          <img
            src={image}
            alt={title}
            onError={(e) => e.target.src = 'https://via.placeholder.com/200'}
          />
        ) : (
          <span className="material-symbols-outlined placeholder-icon">image</span>
        )}
      </div>

      <div className="card-text">
        <h3>{title}</h3>
        {description && <p className="card-description">{description}</p>}
        <p className="card-price">${price}</p>

        <button
          type="button"
          className={`save-card-btn ${isSaved ? 'saved' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave(id, isBundle);
          }}
          aria-label={isSaved ? 'Unsave listing' : 'Save listing'}
        >
          <span className="material-symbols-outlined">bookmark</span>
        </button>
      </div>
    </div>
  );
}

function App() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [savedListings, setSavedListings] = useState({});
  const [sortOrder, setSortOrder] = useState("new");
  const [showFullForm, setShowFullForm] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [minPriceError, setMinPriceError] = useState("");
  const [maxPriceError, setMaxPriceError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const { username } = useParams();

  const getSavedKey = (id, isBundle) => `${isBundle ? 'bundle' : 'listing'}-${id}`;

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleAuthError = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("token_expires");
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    navigate("/");
  };

  const handleToggleSave = async (itemId, isBundle) => {
    const token = localStorage.getItem("token");
    const saveKey = getSavedKey(itemId, isBundle);
    const previousValue = !!savedListings[saveKey];

    setSavedListings((prev) => ({
      ...prev,
      [saveKey]: !previousValue,
    }));

    try {
      const response = await fetch(`/CSE442/2026-Spring/cse-442s/api/save_listing_toggle.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(
          isBundle
            ? { bundle_id: itemId }
            : { listing_id: itemId }
        ),
      });

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to toggle saved item");
      }
    } catch (err) {
      console.error("Failed to toggle saved item:", err);

      setSavedListings((prev) => ({
        ...prev,
        [saveKey]: previousValue,
      }));
    }
  };

  const fetchListings = (queryOverride = null) => {
    const token = localStorage.getItem("token");

    const currentQuery = queryOverride !== null ? queryOverride : searchQuery;
    const trimmedQuery = currentQuery.trim();

    setActiveSearch(trimmedQuery);

    const endpoint = trimmedQuery === ""
      ? `/CSE442/2026-Spring/cse-442s/api/listings.php`
      : `/CSE442/2026-Spring/cse-442s/api/search.php?query=${encodeURIComponent(trimmedQuery)}`;

    fetch(endpoint, {
      headers: { "Authorization": `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          handleAuthError();
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data)) {
          setProducts(data);

          setSavedListings((prev) => {
            const nextSaved = { ...prev };

            data.forEach((p) => {
              const isBundle = parseInt(p.is_bundle) === 1;
              const saveKey = getSavedKey(p.id, isBundle);

              if (typeof nextSaved[saveKey] === "undefined") {
                const rawSaved = p.is_saved ?? p.saved ?? p.isSaved;
                nextSaved[saveKey] = Number(rawSaved) === 1;
              }
            });

            return nextSaved;
          });
        }
      })
      .catch((err) => console.error("Failed to fetch listings:", err));
  };

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitListing = async ({ title, price, quantity, description, image, images, tags, bundleItems }) => {
    const token = localStorage.getItem("token");

    if (bundleItems && bundleItems.length > 0) {
      const response = await fetch(
        `/CSE442/2026-Spring/cse-442s/api/bundle_creation.php`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title, bundleItems }),
        }
      );

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create bundle");
      }

      fetchListings();
      return;
    }

    const form = new FormData();
    form.append("title", title);
    form.append("price", price);
    form.append("quantity", quantity);

    if (description) form.append("description", description);

    if (images && Array.isArray(images)) {
      images.forEach(file => form.append("images[]", file));
    } else if (image) {
      form.append("image", image);
    }

    if (tags && tags.length > 0) form.append("tags", tags.join(","));

    const response = await fetch(
      `/CSE442/2026-Spring/cse-442s/api/create_listing.php`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );

    if (response.status === 401) {
      handleAuthError();
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to create listing");
    }

    fetchListings();
  };

  const filteredProducts = [...products]
    .filter((p) => {
      const validMinPrice = minPrice === "" ? 0 : Number(minPrice);
      const validMaxPrice = maxPrice === "" ? Infinity : Number(maxPrice);

      const priceOk = Number(p.price) >= validMinPrice && Number(p.price) <= validMaxPrice;
      if (!priceOk) return false;

      if (parseInt(p.is_bundle) === 1) return true;

      const listingTags = (p.tags || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (selectedTags.length === 0) return true;
      return selectedTags.every((t) => listingTags.includes(t));
    })
    .sort((a, b) => {
      if (sortOrder === "price-asc") return Number(a.price) - Number(b.price);
      if (sortOrder === "price-desc") return Number(b.price) - Number(a.price);
      return 0;
    });

  return (
    <div className="layout-wrapper">
      {showFullForm && (
        <CreateListing
          onClose={() => setShowFullForm(false)}
          onSubmit={submitListing}
        />
      )}

      <Navbar />

      <div className="content-container">
        <aside className="filter-sidebar">
          <div className="sidebar-group">
            <p className="price-filter-label">Enter a price in dollars ($) to filter</p>

            <div className="price-info">
              <div className="price-input-group">
                <input
                  type="text"
                  inputMode="numeric"
                  className="price-input"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    if (!/^\d*$/.test(rawValue)) return;
                    if (rawValue.length > 5) return;

                    setMinPrice(rawValue);

                    if (rawValue === "") {
                      setMinPriceError("");
                    } else if (maxPrice !== "" && Number(rawValue) > Number(maxPrice)) {
                      setMinPriceError("Minimum price cannot be greater than maximum price.");
                    } else {
                      setMinPriceError("");
                    }
                  }}
                />
                {minPriceError && <p className="price-error">{minPriceError || "\u00A0"}</p>}
              </div>

              <span className="price-to">to</span>

              <div className="price-input-group">
                <input
                  type="text"
                  inputMode="numeric"
                  className="price-input"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    if (!/^\d*$/.test(rawValue)) return;
                    if (rawValue.length > 5) return;

                    setMaxPrice(rawValue);

                    if (rawValue === "") {
                      setMaxPriceError("");
                    } else if (minPrice !== "" && Number(rawValue) < Number(minPrice)) {
                      setMaxPriceError("Maximum price cannot be less than minimum price.");
                    } else {
                      setMaxPriceError("");
                    }
                  }}
                />
                {maxPriceError && <p className="price-error">{maxPriceError || "\u00A0"}</p>}
              </div>
            </div>
          </div>

          <div className="sidebar-group">
            <h4 className="sidebar-title">Tags</h4>
            <div className="tags-list">
              {["North Campus", "South Campus", "Downtown Campus", "Small", "Medium", "Large"].map(tag => (
                <label key={tag} className={`tag-checkbox${selectedTags.includes(tag) ? ' active' : ''}`}>
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
        </aside>

        <main className="main-feed">
          <div className="search-toolbar">
            <div className="search-input-wrapper">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchListings(); }}
                maxLength={200}
              />
              <span
                className="material-symbols-outlined search-icon"
                onClick={() => fetchListings()}
                style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              >
                search
              </span>
            </div>

            <div className="toolbar-right">
              <div className="sort-dropdown-wrapper">
                <span className="material-symbols-outlined sort-icon">swap_vert</span>
                <select
                  className="sort-dropdown"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                >
                  <option value="new">Newest</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              </div>

              <button className="create-listing-btn" onClick={() => setShowFullForm(true)}>
                + Create a Listing
              </button>
            </div>
          </div>

          {activeSearch && (
            <h3 style={{ marginBottom: "15px", color: "#333", paddingLeft: "10px" }}>
              Search results for "{activeSearch}"
            </h3>
          )}

          <div className="listings-grid">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((p) => {
                const isBundle = parseInt(p.is_bundle) === 1;
                const saveKey = getSavedKey(p.id, isBundle);

                return (
                  <ProductCard
                    key={saveKey}
                    id={p.id}
                    title={p.title}
                    price={p.price}
                    description={p.description}
                    isBundle={isBundle}
                    image={isBundle ? p.items : p.image}
                    username={p.username}
                    profilePhoto={p.profile_photo}
                    isSaved={!!savedListings[saveKey]}
                    onToggleSave={handleToggleSave}
                    onClick={() =>
                      isBundle
                        ? navigate("/bundlepage", { state: { bundleId: p.id } })
                        : navigate("/listingpage", { state: { product: p } })
                    }
                    tags={p.tags}
                  />
                );
              })
            ) : (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "#666" }}>
                <h2>No results found</h2>
                <p>Try adjusting your search or clearing your filters.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;