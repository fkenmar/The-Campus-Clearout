import './SavedPage.css';
import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UnreadContext } from '../../App';
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
  isBundle,
  isSold
}) {
  return (
    <div
      className={`product-card${isBundle ? ' bundle-card' : ''}${isSold ? ' sold' : ''}`}
      onClick={isSold ? undefined : onClick}
      style={{ cursor: isSold ? 'default' : 'pointer' }}
    >
      {isSold && <div className="sold-badge">SOLD</div>}
      <div className="card-user-info">
        {profilePhoto ? (
          <img
            src={profilePhoto}
            className="card-avatar"
            alt={username}
            onError={(e) => (e.target.style.display = 'none')}
          />
        ) : (
          <div className="card-avatar-default">
            {username ? username[0].toUpperCase() : '?'}
          </div>
        )}
        <span className="card-username">{username || 'Unknown'}</span>
      </div>

      <div className="card-image-box">
        {Array.isArray(image) ? (
          <div className="bundle-collage">
            {image.slice(0, 4).map((item, index) => (
              <img
                key={index}
                src={typeof item === 'string' ? item : item.image}
                className="bundle-collage-img"
                alt=""
              />
            ))}
          </div>
        ) : image ? (
          <img
            src={image}
            alt={title}
            onError={(e) => (e.target.src = 'https://via.placeholder.com/200')}
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

function SavedPage() {
  const PRICE_FILTER_MAX_LENGTH = 5;
  const navigate = useNavigate();
  const unreadCount = useContext(UnreadContext);

  const [products, setProducts] = useState([]);
  const [savedListings, setSavedListings] = useState({});
  const [sortOrder, setSortOrder] = useState('new');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [minPriceError, setMinPriceError] = useState('');
  const [maxPriceError, setMaxPriceError] = useState('');

  const getSavedKey = (id, isBundle) => `${isBundle ? 'bundle' : 'listing'}-${id}`;
  const getSavedCacheKey = () => {
    const userId = localStorage.getItem('user_id') || 'guest';
    return `saved-page-cache-${userId}`;
  };

  const readSavedCache = () => {
    try {
      const raw = localStorage.getItem(getSavedCacheKey());
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  };

  const writeSavedCache = (items) => {
    try {
      localStorage.setItem(getSavedCacheKey(), JSON.stringify(items));
    } catch (_) { }
  };

  const handlePriceInputChange = (rawValue, setValue, setError, nextError = '') => {
    if (!/^\d*$/.test(rawValue)) {
      return;
    }

    setValue(rawValue);
    setError(nextError);
  };

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAuthError = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('token_expires');
    localStorage.removeItem('username');
    localStorage.removeItem('user_id');
    navigate('/');
  };

  const fetchSavedListings = () => {
    const token = localStorage.getItem('token');

    fetch(`/CSE442/2026-Spring/cse-442s/api/list_saved.php`, {
      headers: { Authorization: `Bearer ${token}` },
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
          const liveItems = data.map((item) => ({
            ...item,
            active: parseInt(item.active, 10) === 0 ? 0 : 1,
          }));

          const liveKeys = new Set(
            liveItems.map((item) => getSavedKey(item.id, parseInt(item.is_bundle) === 1))
          );

          const soldFallbackItems = readSavedCache()
            .filter((item) => {
              const isBundle = parseInt(item.is_bundle) === 1;
              const saveKey = getSavedKey(item.id, isBundle);
              return !isBundle && !liveKeys.has(saveKey);
            })
            .map((item) => ({
              ...item,
              active: 0,
            }));

          const mergedItems = [...liveItems, ...soldFallbackItems];

          setProducts(mergedItems);
          writeSavedCache(mergedItems);

          const savedMap = {};
          mergedItems.forEach((p) => {
            const isBundle = parseInt(p.is_bundle) === 1;
            savedMap[getSavedKey(p.id, isBundle)] = true;
          });

          setSavedListings(savedMap);
        }
      })
      .catch((err) => console.error('Failed to fetch saved listings:', err));
  };

  const handleToggleSave = async (itemId, isBundle) => {
    const token = localStorage.getItem('token');
    const saveKey = getSavedKey(itemId, isBundle);
    const previousValue = !!savedListings[saveKey];

    setSavedListings((prev) => ({
      ...prev,
      [saveKey]: !previousValue,
    }));

    setProducts((prev) => {
      const nextProducts = prev.filter((p) => {
        const pIsBundle = parseInt(p.is_bundle) === 1;
        return getSavedKey(p.id, pIsBundle) !== saveKey;
      });
      writeSavedCache(nextProducts);
      return nextProducts;
    });

    try {
      const response = await fetch(`/CSE442/2026-Spring/cse-442s/api/save_listing_toggle.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
        throw new Error('Failed to toggle saved item');
      }
    } catch (err) {
      console.error('Failed to toggle saved item:', err);
      fetchSavedListings();
    }
  };

  useEffect(() => {
    fetchSavedListings();
  }, []);

  const filteredProducts = [...products]
    .filter((p) => {
      const validMinPrice = minPrice === '' ? 0 : Number(minPrice);
      const validMaxPrice = maxPrice === '' ? Infinity : Number(maxPrice);

      const priceOk = Number(p.price) >= validMinPrice && Number(p.price) <= validMaxPrice;
      if (!priceOk) return false;

      if (parseInt(p.is_bundle) === 1) return true;

      const listingTags = (p.tags || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (selectedTags.length === 0) return true;
      return selectedTags.every((t) => listingTags.includes(t));
    })
    .sort((a, b) => {
      if (sortOrder === 'price-asc') return Number(a.price) - Number(b.price);
      if (sortOrder === 'price-desc') return Number(b.price) - Number(a.price);
      return 0;
    });

  return (
    <div className="layout-wrapper">
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

                    handlePriceInputChange(
                      rawValue,
                      setMinPrice,
                      setMinPriceError,
                      maxPrice !== '' && rawValue !== '' && Number(rawValue) > Number(maxPrice)
                        ? 'Minimum price cannot be greater than maximum price.'
                        : ''
                    );
                  }}
                  maxLength={PRICE_FILTER_MAX_LENGTH}
                />
                {minPriceError && <p className="price-error">{minPriceError}</p>}
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

                    handlePriceInputChange(
                      rawValue,
                      setMaxPrice,
                      setMaxPriceError,
                      minPrice !== '' && rawValue !== '' && Number(rawValue) < Number(minPrice)
                        ? 'Maximum price cannot be less than minimum price.'
                        : ''
                    );
                  }}
                  maxLength={PRICE_FILTER_MAX_LENGTH}
                />
                {maxPriceError && <p className="price-error">{maxPriceError}</p>}
              </div>
            </div>
          </div>

          <div className="sidebar-group">
            <h4 className="sidebar-title">Tags</h4>
            <div className="tags-list">
              {['North Campus', 'South Campus', 'Downtown Campus', 'Small', 'Medium', 'Large'].map((tag) => (
                <label
                  key={tag}
                  className={`tag-checkbox${selectedTags.includes(tag) ? ' active' : ''}`}
                >
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
            <div style={{ fontWeight: 700, fontSize: '22px', color: '#333' }}>
              Saved Listings
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
            </div>
          </div>

          <div className="listings-grid">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((p) => {
                const isBundle = parseInt(p.is_bundle) === 1;
                const saveKey = getSavedKey(p.id, isBundle);
                const isSold = !isBundle && Number(p.active) === 0;

                return (
                  <ProductCard
                    key={saveKey}
                    id={p.id}
                    title={p.title}
                    price={p.price}
                    description={p.description}
                    image={isBundle ? p.items : p.image}
                    username={p.username}
                    profilePhoto={p.profile_photo}
                    isBundle={isBundle}
                    isSold={isSold}
                    isSaved={!!savedListings[saveKey]}
                    onToggleSave={handleToggleSave}
                    onClick={() =>
                      isBundle
                        ? navigate('/bundlepage', { state: { bundleId: p.id } })
                        : navigate('/listingpage', { state: { product: p } })
                    }
                  />
                );
              })
            ) : (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '40px',
                  color: '#666',
                }}
              >
                <h2>No saved listings</h2>
                <p>Anything you bookmark will show up here.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default SavedPage;
