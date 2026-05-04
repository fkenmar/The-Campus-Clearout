import './CoursePage.css';
import { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UnreadContext } from '../../App';
import CreateListing from '../CreateListing/CreateListing';
import CreateCourse from '../CreateCourse/CreateCourse';
import Navbar from '../Navbar/Navbar';

// 1. We brought over the massive list of course codes
const TAG_OPTIONS = [
  "AAS", "APY", "ARC", "ART", "ASL", "BCH", "BIO", "BPH", "CAS", "CDA", 
  "CE", "CHE", "CHI", "CL", "COM", "CPM", "CSE", "DAC", "DAE", "DMS", 
  "ECO", "EE", "ELI", "ENG", "END", "ES", "FR", "GEO", "GER", "GLY", 
  "GR", "HIS", "HON", "IEF", "IE", "ITA", "JPN", "KOR", "LAT", "LAW", 
  "LAI", "LIN", "MAE", "MGA", "MGB", "MGF", "MGI", "MGO", "MGS", "MGT", 
  "MIC", "MTH", "MTR", "MUS", "NRS", "NSG", "NTR", "OT", "PAS", "PGY", 
  "PHI", "PHO", "PHY", "POL", "PMY", "POR", "PSY", "PT", "PUB", "REC", 
  "RUS", "SSC", "SOC", "SPA", "SSP", "TH", "UBE", "URP", "VS"
];

// NEW: Passed the full course object, currentUser, and handlers
function CourseCard({ course, currentUser, onEdit, onDelete }) {
  // Check if the current user is the creator of the course
  const isOwner = currentUser === course.username || currentUser === course.prof;

  return (
    <div className="course-card">
      <h3 className="course-card-title">{course.title || 'Untitled course'}</h3>
      <p className="course-card-prof">{course.prof || 'Professor TBA'}</p>
      <p className="course-card-desc">{course.description || 'No description provided.'}</p>
      <p className="course-card-materials"><strong>Materials:</strong> {course.materials || 'No materials listed.'}</p>
      
      {/* NEW: Action buttons for the owner */}
      {isOwner && (
        <div className="course-card-actions">
          <button className="course-edit-btn" onClick={() => onEdit(course)}>
            Edit Course
          </button>
          <button className="course-delete-btn" onClick={() => onDelete(course.id)}>
            Delete Course
          </button>
        </div>
      )}
    </div>
  );
}

function ProductCard({ image, title, price, username, profilePhoto, onClick }) {
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
        <p className="card-price">${price}</p>
      </div>
    </div>
  );
}

function App() {
  const SEARCH_MAX_LENGTH = 100;
  const navigate = useNavigate();
  const unreadCount = useContext(UnreadContext);
  const [courses, setCourses] = useState([]);
  const [coursesError, setCoursesError] = useState("");
  const [sortOrder, setSortOrder] = useState("new");
  const [showForm, setShowForm] = useState(false);
  const [showFullForm, setShowFullForm] = useState(false);
  const [showMobileTags, setShowMobileTags] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [formData, setFormData] = useState({ title: "", price: "", description: "", image: null });
  const [imagePreview, setImagePreview] = useState(null);
  const [formError, setFormError] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");

  const [showCreateCourse, setShowCreateCourse] = useState(false);
  
  const [isProf, setIsProf] = useState(false);

  // NEW: State for tracking the editing course and getting the current user
  const [editingCourse, setEditingCourse] = useState(null);
  const currentUser = localStorage.getItem("username");

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleLogout = async () => {
    const token = localStorage.getItem("token");
    try {
      await fetch(`/CSE442/2026-Spring/cse-442s/api/logout.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    }
    localStorage.removeItem("token");
    localStorage.removeItem("token_expires");
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    navigate("/");
  };

  const handleAuthError = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("token_expires");
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    navigate("/");
  };

  const normalizeCoursePayload = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.courses)) return data.courses;
    return [];
  };

  const fetchCourses = () => {
    const token = localStorage.getItem("token");
    setCoursesError("");
    fetch(`/CSE442/2026-Spring/cse-442s/api/courselistings.php`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) {
          handleAuthError();
          return { done: true };
        }
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          setCourses([]);
          setCoursesError(
            "Could not read course list (server did not return JSON). Is courselistings.php deployed under your build’s api folder?"
          );
          return { done: true };
        }
        if (!res.ok) {
          const msg =
            (typeof data.error === "string" && data.error) ||
            (typeof data.message === "string" && data.message) ||
            `Request failed (${res.status})`;
          setCourses([]);
          setCoursesError(msg);
          return { done: true };
        }
        const rows = normalizeCoursePayload(data);
        setCourses(rows);
        if (rows.length === 0 && data && data.success === false) {
          setCoursesError(data.error || "No courses returned.");
        }
        return { done: true };
      })
      .catch((err) => {
        setCourses([]);
        setCoursesError("Network error while loading courses.");
      });
  };

  useEffect(() => {
    fetchCourses();

    const token = localStorage.getItem("token");
    if (token) {
      fetch("/CSE442/2026-Spring/cse-442s/api/settings.php", {
        headers: { "Authorization": `Bearer ${token}` },
        cache: "no-store"
      })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          const isProfessor = String(data.prof) === "1" || 
                              String(data.prof).toLowerCase() === "true" || 
                              data.prof === 1 || 
                              data.prof === true;
                              
          setIsProf(isProfessor);
        }
      })
      .catch(err => console.error("Failed to fetch user role:", err));
    }
  }, []);

// NEW: Delete Course API Call (NO ALERTS)
  const handleDeleteCourse = async (courseId) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/CSE442/2026-Spring/cse-442s/api/delete_course.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ course_id: courseId })
      });

      if (res.ok) {
        fetchCourses(); // Refresh list automatically
        setCoursesError(""); // Clear any old errors
      } else {
        const data = await res.json();
        // Sets the React state instead of alerting
        setCoursesError(data.message || "Failed to delete course.");
      }
    } catch (err) {
      console.error(err);
      // Sets the React state instead of alerting
      setCoursesError("Network error while trying to delete course.");
    }
  };

  const submitListing = async ({ title, price, description, image, tags }) => {
    const token = localStorage.getItem("token");
    const form = new FormData();
    form.append("title", title);
    form.append("price", price);
    if (description) form.append("description", description);
    if (image) form.append("image", image);
    if (tags && tags.length > 0) form.append("tags", tags.join(","));

    const response = await fetch(`/CSE442/2026-Spring/cse-442s/api/create_listing.php`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (response.status === 401) {
      handleAuthError();
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to create listing");
    }
  };

  const handleCreateListing = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!formData.image) {
      setFormError("An image is required.");
      return;
    }
    try {
      await submitListing({
        title: formData.title,
        price: formData.price,
        description: formData.description,
        image: formData.image,
        tags: selectedTags
      });
      setFormData({ title: "", price: "", description: "", image: null });
      setSelectedTags([]);
      setImagePreview(null);
      setShowForm(false);
    } catch (err) {
      setFormError(err.message || "Server error. Try again later.");
    }
  };

  const courseMatchesSearch = (c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const hay = [c.title, c.prof, c.description].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  };

  const courseMatchesTags = (c) => {
    if (selectedTags.length === 0) return true;
    const courseTags = (c.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
    return selectedTags.some((tag) => courseTags.includes(tag));
  };

  const sortedFilteredCourses = [...courses]
    .filter(courseMatchesSearch)
    .filter(courseMatchesTags)
    .sort((a, b) => {
      if (sortOrder === 'title-asc') {
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      }
      if (sortOrder === 'title-desc') {
        return (b.title || '').localeCompare(a.title || '', undefined, { sensitivity: 'base' });
      }
      return Number(b.id) - Number(a.id);
    });

  const closeSmallForm = () => {
    setShowForm(false);
    setImagePreview(null);
    setFormData({ title: "", price: "", description: "", image: null });
    setSelectedTags([]);
    setFormError("");
  };

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setSearchError(
      value.length === SEARCH_MAX_LENGTH
        ? `Search has reached the ${SEARCH_MAX_LENGTH}-character limit.`
        : ""
    );
  };

  return (
    <div className="layout-wrapper">
      {/* NEW: Passed down editData and adjusted onClose */}
      {showFullForm && (
        <CreateCourse
          isOpen={showFullForm}
          onClose={() => {
            setShowFullForm(false);
            setEditingCourse(null);
          }}
          onSuccess={fetchCourses}
          editData={editingCourse}
        />
      )}

      <Navbar />

      <div className="content-container course-page-content">
        <aside className="filter-sidebar">
          <div className="sidebar-group">
            <div className="sidebar-group-header">
              <h4 className="sidebar-title">Tags</h4>
              <button
                type="button"
                className={`mobile-toggle-btn${showMobileTags ? ' expanded' : ''}`}
                onClick={() => setShowMobileTags((prev) => !prev)}
                aria-expanded={showMobileTags}
              >
                {showMobileTags ? 'Hide' : 'Show'} tags
                <span className="material-symbols-outlined">
                  {showMobileTags ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            </div>
            {/* Added scrollable container for the massive list */}
            <div
              className={`tags-list${showMobileTags ? ' expanded' : ' collapsed'}`}
              style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '10px' }}
            >
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`tag-checkbox${selectedTags.includes(tag) ? ' active' : ''}`}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={selectedTags.includes(tag)}
                >
                  {tag}
                </button>
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
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                maxLength={SEARCH_MAX_LENGTH}
              />
              <span className="material-symbols-outlined search-icon" aria-hidden>search</span>
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
                  <option value="title-asc">Title: A–Z</option>
                  <option value="title-desc">Title: Z–A</option>
                </select>
              </div>
              
              {isProf && (
                <button 
                  className="create-listing-btn" 
                  onClick={() => {
                    setEditingCourse(null); // Ensure "Create" mode
                    setShowFullForm(true);
                  }}
                >
                  + Create a Course
                </button>
              )}
            </div>
          </div>

          <h2 className="available-courses-heading">Available Courses</h2>

          {coursesError && <p className="courses-load-error" role="alert">{coursesError}</p>}
          {!coursesError && courses.length > 0 && sortedFilteredCourses.length === 0 && (
            <p className="courses-empty-hint">No courses match your search.</p>
          )}
          {!coursesError && courses.length === 0 && (
            <p className="courses-empty-hint">No courses in the database yet.</p>
          )}

          <div className="courses-grid">
            {sortedFilteredCourses.map((c, idx) => (
              <CourseCard
                key={c.id != null ? String(c.id) : `course-${idx}`}
                course={c}
                currentUser={currentUser}
                onEdit={(courseToEdit) => {
                  setEditingCourse(courseToEdit);
                  setShowFullForm(true);
                }}
                onDelete={handleDeleteCourse}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
