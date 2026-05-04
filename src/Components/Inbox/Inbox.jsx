import React, { useState, useEffect, useRef, useContext } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { UnreadContext } from '../../App';
import '../HomePage/HomePage.css';
import './Inbox.css';
import Navbar from '../Navbar/Navbar';

const API_BASE = "/CSE442/2026-Spring/cse-442s/api";

function playSendSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.setValueAtTime(800, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) { }
}

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const CHAT_SEARCH_MAX_LENGTH = 100;
const MESSAGE_MAX_LENGTH = 1000;
const MAX_IMAGE_FILE_SIZE = 2 * 1024 * 1024;
const SCHEDULE_LOCATION_MAX_LENGTH = 150;
const SCHEDULE_NOTE_MAX_LENGTH = 300;
const TRANSACTION_NOTE_MAX_LENGTH = 300;

const getLimitMessage = (field, max) =>
  `${field} has reached the ${max}-character limit.`;

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function renderMessageText(text, onLinkClick) {
  const tagParts = text.split(/(\[calendar:[^\]]+\])/g);
  return tagParts.map((part, i) => {
    const calMatch = part.match(/\[calendar:(.+)\]/);
    if (calMatch) {
      const calUrl = calMatch[1];
      return (
        <a key={i} className="bubble-location" href={calUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
          <span className="material-symbols-outlined">calendar_month</span>
          Add to Google Calendar
        </a>
      );
    }
    const urlParts = part.split(URL_REGEX);
    return urlParts.map((p, j) => {
      if (URL_REGEX.test(p)) {
        URL_REGEX.lastIndex = 0;
        return <span key={`${i}-${j}`} className="msg-link" onClick={() => onLinkClick(p.startsWith('http') ? p : 'https://' + p)}>{p}</span>;
      }
      return p;
    });
  });
}

function formatDateSeparator(dateStr) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  if (dateStr === todayStr) return "TODAY";
  if (dateStr === yesterdayStr) return "YESTERDAY";
  const msgDate = new Date(dateStr + 'T00:00:00');
  return msgDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric',
    ...(msgDate.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
  }).toUpperCase();
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const normalized = typeof timestamp === "string" ? timestamp.replace(" ", "T") : timestamp;
  const messageDate = new Date(normalized);
  if (isNaN(messageDate.getTime())) return "";

  const diffInSeconds = Math.floor((now - messageDate) / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDayStart = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const dayDiff = Math.round((todayStart - msgDayStart) / (1000 * 60 * 60 * 24));

  if (diffInSeconds < 60) {
    return "Just now";
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (dayDiff === 0) {
    return `${diffInHours}h ago`;
  } else if (dayDiff === 1) {
    return "Yesterday";
  } else {
    return messageDate.toLocaleDateString();
  }
}

function Inbox() {
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = useContext(UnreadContext);
  const [soldErrorMsg, setSoldErrorMsg] = useState("");

  const [reviewErrorMsg, setReviewErrorMsg] = useState("");
  const [soldBundleErrorMsg, setSoldBundleErrorMsg] = useState("");
  const [transactionErrorMsg, setTransactionErrorMsg] = useState("");

  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [inputText, setInputText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [openMsgMenu, setOpenMsgMenu] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageErrorMsg, setImageErrorMsg] = useState("");
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [linkWarning, setLinkWarning] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [limitError, setLimitError] = useState("");

  const [showSoldModal, setShowSoldModal] = useState(null);
  const [soldRating, setSoldRating] = useState(0);
  const [soldHover, setSoldHover] = useState(0);
  const [soldNote, setSoldNote] = useState("");

  const [showReviewModal, setShowReviewModal] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewNote, setReviewNote] = useState("");

  const [showCompleteTransactionModal, setShowCompleteTransactionModal] = useState(false);
  const [selectedTransactionItems, setSelectedTransactionItems] = useState({});
  const [transactionRating, setTransactionRating] = useState(0);
  const [transactionHover, setTransactionHover] = useState(0);
  const [transactionNote, setTransactionNote] = useState("");

  const [showSoldBundleModal, setShowSoldBundleModal] = useState(false);
  const [selectedSoldItems, setSelectedSoldItems] = useState({});
  const [soldBundleRating, setSoldBundleRating] = useState(0);
  const [soldBundleHover, setSoldBundleHover] = useState(0);
  const [soldBundleNote, setSoldBundleNote] = useState("");

  const [mobileView, setMobileView] = useState('list');
  const [mobileListingIndex, setMobileListingIndex] = useState(0);
  const [isMobileBannerExpanded, setIsMobileBannerExpanded] = useState(false);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const fileInputRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const getCurrentUserId = () => {
    const raw = localStorage.getItem("user_id");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getCurrentUsername = () => {
    const raw = localStorage.getItem("username");
    if (typeof raw !== "string") return null;
    const normalized = raw.trim().toLowerCase();
    return normalized || null;
  };

  const isCurrentUserSeller = (listing, chat) => {
    const myUserId = getCurrentUserId();
    const sellerId = listing?.seller_id ?? chat?.contact?.seller_id ?? null;
    if (myUserId !== null && sellerId !== null && Number(myUserId) === Number(sellerId)) {
      return true;
    }

    const myUsername = getCurrentUsername();
    const sellerUsername = listing?.username ?? chat?.contact?.seller ?? null;
    if (myUsername === null || typeof sellerUsername !== "string") {
      return false;
    }

    return myUsername === sellerUsername.trim().toLowerCase();
  };

  const handleMarkSold = async () => {
    if (!activeChat || !showSoldModal) return;
    const token = localStorage.getItem("token");
    setSoldErrorMsg(""); // Clear previous errors

    try {
      const response = await fetch(`${API_BASE}/mark_sold.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: activeChat.id,
          listing_id: showSoldModal,
          rating: soldRating,
          note: soldNote
        })
      });

      if (response.ok) {
        loadConversation(activeChat.id);
        // Only close and clear if successful!
        setShowSoldModal(null);
        setSoldRating(0);
        setSoldNote("");
      } else {
        const data = await response.json();
        setSoldErrorMsg(data.message || "Failed to process transaction.");
      }
    } catch (err) {
      console.error("Error marking as sold:", err);
      setSoldErrorMsg("Network error. Try again.");
    }
  };

  const handleRelistItem = async (listingId) => {
    const token = localStorage.getItem("token");
    try {
      const response = await fetch(`${API_BASE}/relist_item.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ listing_id: listingId })
      });

      if (response.ok) {
        loadConversation(activeChat.id);
      }
    } catch (err) {
      console.error("Error relisting item:", err);
    }
  };

 const handleSubmitReview = async () => {
    if (!activeChat || !showReviewModal) return;
    const token = localStorage.getItem("token");
    setReviewErrorMsg(""); // Clear previous errors

    try {
      const response = await fetch(`${API_BASE}/submit_review.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: activeChat.id,
          listing_id: showReviewModal,
          rating: reviewRating,
          note: reviewNote
        })
      });

      if (response.ok) {
        loadConversation(activeChat.id);
        // Only close and clear if successful
        setShowReviewModal(null);
        setReviewRating(0);
        setReviewNote("");
      } else {
        const data = await response.json();
        setReviewErrorMsg(data.message || "Failed to submit review.");
      }
    } catch (err) {
      console.error("Error submitting review:", err);
      setReviewErrorMsg("Network error. Try again.");
    }
  };

  const openCompleteTransactionModal = () => {
    if (!activeChat) return;
    const soldUnreviewed = activeChat.listings.filter(l => Number(l.active) === 0 && !l.reviewed && !l.removed_by_buyer);
    if (soldUnreviewed.length === 0) return;
    const preChecked = {};
    soldUnreviewed.forEach(l => { preChecked[l.id] = true; });
    setSelectedTransactionItems(preChecked);
    setTransactionRating(0);
    setTransactionHover(0);
    setTransactionNote("");
    setShowCompleteTransactionModal(true);
  };

  const openSoldBundleModal = () => {
    if (!activeChat) return;
    const activeListings = activeChat.listings.filter(l => Number(l.active) === 1);
    if (activeListings.length === 0) return;
    const preChecked = {};
    activeListings.forEach(l => { preChecked[l.id] = true; });
    setSelectedSoldItems(preChecked);
    setSoldBundleRating(0);
    setSoldBundleHover(0);
    setSoldBundleNote("");
    setShowSoldBundleModal(true);
  };

 const handleMarkSoldBundle = async () => {
    if (!activeChat) return;
    const token = localStorage.getItem("token");
    const checkedIds = Object.keys(selectedSoldItems).filter(id => selectedSoldItems[id]).map(Number);
    if (checkedIds.length === 0 || soldBundleRating < 1) return;
    setSoldBundleErrorMsg("");

    try {
      const response = await fetch(`${API_BASE}/mark_sold.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: activeChat.id,
          listing_id: checkedIds,
          rating: soldBundleRating,
          note: soldBundleNote
        })
      });

      if (response.ok) {
        loadConversation(activeChat.id);
        // Only close and clear if successful
        setShowSoldBundleModal(false);
        setSelectedSoldItems({});
        setSoldBundleRating(0);
        setSoldBundleNote("");
      } else {
        const data = await response.json();
        setSoldBundleErrorMsg(data.message || "Failed to complete transaction.");
      }
    } catch (err) {
      console.error("Error marking as sold:", err);
      setSoldBundleErrorMsg("Network error. Try again.");
    }
  };

 const handleCompleteTransaction = async () => {
    if (!activeChat) return;
    const token = localStorage.getItem("token");
    const checkedIds = Object.keys(selectedTransactionItems).filter(id => selectedTransactionItems[id]).map(Number);
    if (checkedIds.length === 0 || transactionRating < 1) return;
    setTransactionErrorMsg("");

    try {
      const response = await fetch(`${API_BASE}/complete_transaction.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: activeChat.id,
          listing_ids: checkedIds,
          rating: transactionRating,
          note: transactionNote
        })
      });

      if (response.ok) {
        loadConversation(activeChat.id);
        // Only close and clear if successful
        setShowCompleteTransactionModal(false);
        setSelectedTransactionItems({});
        setTransactionRating(0);
        setTransactionNote("");
      } else {
        const data = await response.json();
        setTransactionErrorMsg(data.message || "Failed to complete transaction.");
      }
    } catch (err) {
      console.error("Error completing transaction:", err);
      setTransactionErrorMsg("Network error. Try again.");
    }
  };

  const sendTypingSignal = (chatId) => {
    const token = localStorage.getItem("token");
    if (!token || !chatId) return;
    fetch(`${API_BASE}/typing.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ chat_id: chatId })
    }).catch(() => { });
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_FILE_SIZE) {
      setImageErrorMsg("This image is too large. The server limit is exactly 2MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImageErrorMsg("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleLimitedChange = (value, setter, field, max) => {
    const limitedValue = value.slice(0, max);
    setter(limitedValue);
    setLimitError(value.length >= max ? getLimitMessage(field, max) : "");
  };

  const fetchConversations = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/get_conversations.php`, {
        headers: { "Authorization": `Bearer ${token}` },
        cache: "no-store"
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setConversations(data);
        setActiveChat(prev => {
          if (!prev) return prev;
          const updated = data.find(c => c.id === prev.id);
          if (!updated) return prev;
          return { ...prev, contact: { ...prev.contact, online: updated.contact.online } };
        });
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async (chatId) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/get_messages.php?chat_id=${chatId}`, {
        headers: { "Authorization": `Bearer ${token}` },
        cache: "no-store"
      });
      const data = await res.json();
      if (res.ok) {
        setActiveChat(data);
        setMobileView('chat');
        fetchConversations();
      }
    } catch (err) {
      console.error("Failed to fetch chat details:", err);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => {
      if (!document.hidden) fetchConversations();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeChat?.id) return;
    const chatId = activeChat.id;
    const poll = async () => {
      if (document.hidden) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/get_messages.php?chat_id=${chatId}`, {
          headers: { "Authorization": `Bearer ${token}` },
          cache: "no-store"
        });
        const data = await res.json();
        if (res.ok) {
          setActiveChat(prev => {
            if (!prev || prev.id !== chatId) return prev;
            return data;
          });
        }
      } catch (_) { }
    };
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [activeChat?.id]);

  useEffect(() => {
    const initChatFromListing = async () => {
      const token = localStorage.getItem("token");

      if (location.state?.bundle) {
        const bundle = location.state.bundle;
        try {
          const res = await fetch(`${API_BASE}/start_bundle_conversation.php`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ bundle_id: bundle.id })
          });
          const data = await res.json();
          if (res.ok && data.chat_id) {
            await fetchConversations();
            loadConversation(data.chat_id);
          }
        } catch (err) {
          console.error("Failed to initialize bundle chat:", err);
        }
      } else if (location.state?.product) {
        const product = location.state.product;
        try {
          const res = await fetch(`${API_BASE}/start_conversation.php`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ listing_id: product.id })
          });
          const data = await res.json();
          if (res.ok && data.chat_id) {
            await fetchConversations();
            loadConversation(data.chat_id);
          }
        } catch (err) {
          console.error("Failed to initialize chat:", err);
        }
      }
    };
    initChatFromListing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const handlePinConversation = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/pin_conversation.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ chat_id: activeChat.id })
      });
      if (res.ok) fetchConversations();
    } catch (err) {
      console.error("Failed to pin conversation:", err);
    }
  };

  const handleDeleteConversation = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/delete_conversation.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ chat_id: activeChat.id })
      });
      if (res.ok) {
        setActiveChat(null);
        fetchConversations();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleRemoveListing = async (listingId) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/remove_listing.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ chat_id: activeChat.id, listing_id: listingId })
      });
      if (res.ok) loadConversation(activeChat.id);
    } catch (err) {
      console.error("Failed to remove listing:", err);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE}/delete_message.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ message_id: msgId })
      });
      if (res.ok) {
        loadConversation(activeChat.id);
      }
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && !imageFile) return;
    if (!activeChat) return;

    const token = localStorage.getItem("token");
    const sentText = inputText.slice(0, MESSAGE_MAX_LENGTH);
    setInputText("");
    clearImage();

    try {
      const formData = new FormData();
      formData.append("chat_id", activeChat.id);
      formData.append("message", sentText);
      if (imageFile) formData.append("image", imageFile);

      const res = await fetch(`${API_BASE}/send_message.php`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        playSendSound();
        loadConversation(activeChat.id);
        fetchConversations();
      } else {
        const errText = await res.text();
        console.error("Failed to send message:", res.status, errText);
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChat?.messages]);

  useEffect(() => {
    isAtBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, [activeChat?.id]);

  useEffect(() => {
    setMobileListingIndex(0);
  }, [activeChat?.id]);

  useEffect(() => {
    if (!isMoreOpen && openMsgMenu === null && !attachMenuOpen) return;
    const close = () => { setIsMoreOpen(false); setOpenMsgMenu(null); setAttachMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isMoreOpen, openMsgMenu, attachMenuOpen]);

  useEffect(() => {
    if (!searchText.trim()) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${API_BASE}/search_messages.php?query=${encodeURIComponent(searchText.trim())}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          const matchMap = {};
          data.forEach(r => {
            if (!matchMap[r.chat_id]) matchMap[r.chat_id] = r.message;
          });
          setSearchResults(matchMap);
        }
      } catch (_) { setSearchResults(null); }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  return (
    <div className="inbox-page-wrapper">

      <Navbar />

      <div className={`inbox-content-container ${mobileView === 'chat' ? 'mobile-show-chat' : 'mobile-show-list'}`}>

        <div className="inbox-sidebar">
          <h1 className="inbox-sidebar-title">Messages</h1>
          <div className={`search-box${searchText ? ' has-text' : ''}`}>
            <span className="material-symbols-outlined search-icon-left">search</span>
            <input
              type="text"
              placeholder="Search chats..."
              value={searchText}
              onChange={(e) =>
                handleLimitedChange(e.target.value, setSearchText, "Search", CHAT_SEARCH_MAX_LENGTH)
              }
              maxLength={CHAT_SEARCH_MAX_LENGTH}
            />
          </div>

          {limitError && (
            <div className="inbox-error-box" role="alert">
              {limitError}
            </div>
          )}

          <div className="contacts-list">
            {isLoading ? <p style={{ textAlign: 'center' }}>Loading...</p> : conversations.length === 0 ? (
              <div className="empty-inbox">
                <span className="material-symbols-outlined">forum</span>
                <p>No conversations yet</p>
                <span>Find a listing on the <Link to="/homepage" style={{ color: 'var(--dark-green)', fontWeight: 600 }}>Home</Link> page and tap <strong>Message Seller</strong> to start chatting.</span>
              </div>
            ) : null}
            {conversations.filter(chat => {
              if (!searchText.trim()) return true;
              const q = searchText.toLowerCase();
              const nameMatch = (chat.contact?.name || "").toLowerCase().includes(q);
              const msgMatch = (chat.latestMessage || "").toLowerCase().includes(q);
              const deepMatch = searchResults !== null && searchResults[chat.id] !== undefined;
              return nameMatch || msgMatch || deepMatch;
            }).map(chat => (
              <div
                key={chat.id}
                className={`contact-card ${(activeChat && activeChat.id === chat.id) ? 'active' : ''}`}
                onClick={() => loadConversation(chat.id)}
              >
                <div className="contact-avatar-wrapper">
                  {chat.contact?.avatar ? (
                    <img src={chat.contact.avatar} alt={chat.contact.name} className="contact-avatar" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                  ) : null}
                  <div className="contact-avatar placeholder" style={chat.contact?.avatar ? { display: 'none' } : {}}>{chat.contact?.initials || "?"}</div>
                  {chat.contact?.online && <div className="online-indicator"></div>}
                </div>
                <div className="contact-info">
                  <div className="contact-name-row">
                    <h4>
                      {chat.pinned && <span className="material-symbols-outlined pin-icon">push_pin</span>}
                      {chat.contact?.name || "Unknown"}
                    </h4>
                    <span className="contact-time">{formatTimestamp(chat.lastUpdated)}</span>
                  </div>
                  <div className="contact-preview-row">
                    <p className="contact-preview">
                      {(() => {
                        const q = searchText.trim().toLowerCase();
                        if (!q) return chat.latestMessage || "No messages yet";
                        const deepMsg = searchResults?.[chat.id];
                        const latestMsg = chat.latestMessage || "";
                        const displayText = deepMsg && deepMsg.toLowerCase().includes(q) ? deepMsg : latestMsg;
                        if (!displayText) return "No messages yet";
                        const idx = displayText.toLowerCase().indexOf(q);
                        if (idx === -1) return displayText;
                        const before = displayText.slice(0, idx);
                        const match = displayText.slice(idx, idx + q.length);
                        const after = displayText.slice(idx + q.length);
                        const trimBefore = before.length > 20 ? '...' + before.slice(-20) : before;
                        const trimAfter = after.length > 30 ? after.slice(0, 30) + '...' : after;
                        return <>{trimBefore}<mark className="search-highlight">{match}</mark>{trimAfter}</>;
                      })()}
                    </p>
                    {chat.unread_count > 0 && (
                      <span className="unread-badge">{chat.unread_count > 99 ? '99+' : chat.unread_count}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="inbox-chat-area">
          {!activeChat ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa' }}>
              Select a conversation to start messaging
            </div>
          ) : (
            <>
              <div className="chat-header">
                <div className="chat-header-user">
                  <button className="mobile-back-btn" onClick={() => setMobileView('list')}>
                    <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                  <div className="contact-avatar-wrapper header-avatar">
                    {activeChat.contact?.avatar ? (
                      <img src={activeChat.contact.avatar} alt={activeChat.contact.name} className="contact-avatar" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                    ) : null}
                    <div className="contact-avatar placeholder" style={activeChat.contact?.avatar ? { display: 'none' } : {}}>{activeChat.contact?.initials || "?"}</div>
                  </div>
                  <div className="chat-header-info">
                    <h2>{activeChat.contact?.name}</h2>
                    <div className="online-status">
                      {activeChat.contact?.online && <div className="online-indicator inline"></div>}
                      <span>{activeChat.contact?.online ? "Online" : "Offline"}</span>
                    </div>
                  </div>
                </div>
                <div className="chat-header-actions">
                  <div className="more-menu-wrapper">
                    <span className="material-symbols-outlined" onClick={() => setIsMoreOpen(prev => !prev)}>more_vert</span>
                    {isMoreOpen && (
                      <div className="more-dropdown" onMouseDown={e => e.stopPropagation()}>
                        <button className="more-dropdown-item" onClick={() => { setIsMoreOpen(false); handlePinConversation(); }}>
                          <span className="material-symbols-outlined">push_pin</span>
                          {conversations.find(c => c.id === activeChat.id)?.pinned ? 'Unpin Conversation' : 'Pin Conversation'}
                        </button>
                        <button className="more-dropdown-item delete" onClick={() => { setIsMoreOpen(false); setConfirmDialog({ message: "Delete this conversation? This cannot be undone.", onConfirm: handleDeleteConversation }); }}>
                          <span className="material-symbols-outlined">delete</span>
                          Delete Conversation
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(() => {
                const listings = activeChat.listings ?? [];
                const total = listings.length;
                if (total === 0) return null;
                const idx = Math.min(mobileListingIndex, total - 1);
                const listing = listings[idx];
                const isSeller = isCurrentUserSeller(listing, activeChat);
                const removedForSeller = isSeller && listing.removed_by_buyer;
                const activeListings = listings.filter(l => !l.removed_by_buyer);
                return (
                  <div className="mobile-listing-carousel">
                    {total > 1 && (
                      <button className="mobile-carousel-nav left" onClick={e => { e.stopPropagation(); setMobileListingIndex(i => (i - 1 + total) % total); }} aria-label="Previous listing">
                        <span className="material-symbols-outlined">chevron_left</span>
                      </button>
                    )}
                    <div className={`mobile-listing-banner${removedForSeller ? ' removed' : ''}`} onClick={() => setIsMobileBannerExpanded(!isMobileBannerExpanded)}>
                      {listing.image
                        ? <img src={listing.image} alt={listing.title} className="mobile-listing-thumb" />
                        : <div className="mobile-listing-thumb placeholder"><span className="material-symbols-outlined">image</span></div>
                      }
                      <div className="mobile-listing-banner-info">
                        <span className="mobile-listing-banner-title">{listing.title}</span>
                        <span className="mobile-listing-banner-price">${Number(listing.price || 0).toFixed(2)}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                          {total > 1 && <span className="mobile-listing-counter" style={{ fontSize: '11px', padding: '2px 6px', background: '#e0e0e0', borderRadius: '4px' }}>{idx + 1} / {total}</span>}
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Tap to {isMobileBannerExpanded ? "close" : "expand"}</span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>
                        {isMobileBannerExpanded ? "expand_less" : "expand_more"}
                      </span>

                      {isMobileBannerExpanded && (
                        <div className="mobile-listing-banner-actions" onClick={e => e.stopPropagation()}>
                          {isSeller ? (
                            removedForSeller ? (
                              <button className="btn-remove-listing" onClick={() => setConfirmDialog({ message: `Remove "${listing.title}" from this conversation?`, onConfirm: () => handleRemoveListing(listing.id) })}>
                                <span className="material-symbols-outlined">remove_circle</span>Dismiss
                              </button>
                            ) : Number(listing.active) === 1 ? (
                              <>
                                <button className="btn-mark-sold" onClick={() => {
                                  if (activeListings.length > 1) {
                                    openSoldBundleModal();
                                  } else {
                                    setSoldRating(0); setSoldHover(0); setSoldNote(""); setShowSoldModal(listing.id);
                                  }
                                }}>
                                  <span className="material-symbols-outlined" style={{ marginRight: '5px', fontSize: '18px' }}>task_alt</span>
                                  Complete Transaction
                                </button>
                                <button className="btn-edit-listing" onClick={() => listing.is_bundle ? navigate('/bundlepage', { state: { bundleId: listing.id } }) : navigate('/listingpage', { state: { product: listing } })}>Edit Listing</button>
                              </>
                            ) : (
                              <>
                                <div className="waiting-badge" style={{ padding: '8px', background: '#f8f9fa', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500', justifyContent: 'center' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hourglass_empty</span>
                                  Waiting for buyer completion
                                </div>
                                <button className="btn-edit-listing" onClick={() => handleRelistItem(listing.id)}>
                                  <span className="material-symbols-outlined" style={{ marginRight: '5px', fontSize: '18px' }}>refresh</span>
                                  Undo / Relist Item
                                </button>
                              </>
                            )
                          ) : (
                            Number(listing.active) === 0 && !listing.reviewed ? (
                              <button className="btn-mark-sold" onClick={() => {
                                const soldUnreviewed = (activeChat.listings || []).filter(l => Number(l.active) === 0 && !l.reviewed && !l.removed_by_buyer);
                                if (soldUnreviewed.length > 1) {
                                  openCompleteTransactionModal();
                                } else {
                                  setReviewRating(0); setReviewHover(0); setReviewNote(""); setShowReviewModal(listing.id);
                                }
                              }}>
                                <span className="material-symbols-outlined" style={{ marginRight: '5px', fontSize: '18px' }}>task_alt</span>
                                Complete Transaction
                              </button>
                            ) : Number(listing.active) === 0 && listing.reviewed ? (
                              <button className="btn-completed-transaction" onClick={() => setConfirmDialog({ message: `Clear "${listing.title}" from this conversation?`, onConfirm: () => handleRemoveListing(listing.id), confirmLabel: 'Clear Item', confirmStyle: { background: 'var(--dark-green, #009966)' } })}>
                                <span className="material-symbols-outlined" style={{ marginRight: '5px', fontSize: '18px' }}>check_circle</span>
                                Transaction Completed
                              </button>
                            ) : (
                              <>
                                <button className="btn-edit-listing" onClick={() => listing.is_bundle ? navigate('/bundlepage', { state: { bundleId: listing.id } }) : navigate('/listingpage', { state: { product: listing } })}>Go to Listing</button>
                                {activeChat.listings.length > 1 && (
                                  <button className="btn-remove-listing" onClick={() => setConfirmDialog({ message: `Remove "${listing.title}" from this conversation?`, onConfirm: () => handleRemoveListing(listing.id) })}>
                                    <span className="material-symbols-outlined">remove_circle</span>Remove
                                  </button>
                                )}
                              </>
                            )
                          )}
                        </div>
                      )}
                    </div>
                    {total > 1 && (
                      <button className="mobile-carousel-nav right" onClick={e => { e.stopPropagation(); setMobileListingIndex(i => (i + 1) % total); }} aria-label="Next listing">
                        <span className="material-symbols-outlined">chevron_right</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              <div
                className="chat-messages-container"
                key={activeChat.id}
                ref={chatContainerRef}
                onScroll={() => {
                  const el = chatContainerRef.current;
                  if (!el) return;
                  isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                }}
              >
                {(!activeChat.messages || activeChat.messages.length === 0) && (
                  <div className="no-messages">Send a message to start the conversation about {activeChat.listings?.[0]?.title}</div>
                )}

                {(() => {
                  let lastDate = null;
                  return activeChat.messages?.flatMap(msg => {
                    const items = [];
                    if (!msg.is_system && msg.date && msg.date !== lastDate) {
                      lastDate = msg.date;
                      items.push(<div key={`sep-${msg.date}`} className="date-separator"><span>{formatDateSeparator(msg.date)}</span></div>);
                    }
                    items.push(msg.is_system ? (
                      <div key={msg.id} className="system-message">
                        <span>{msg.text}</span>
                      </div>
                    ) : (
                      <div key={msg.id} className={`chat-bubble-row ${msg.sender === 'me' ? 'me' : 'them'}${openMsgMenu === msg.id ? ' menu-open' : ''}`}>
                        {msg.sender === 'them' && (
                          <div className="bubble-avatar placeholder small">{activeChat.contact?.initials}</div>
                        )}
                        <div className={`chat-bubble ${msg.sender === 'me' ? 'me' : 'them'}`}>
                          {msg.image_url && <img src={msg.image_url} alt="sent" className="bubble-image" onClick={() => setLightboxUrl(msg.image_url)} />}
                          {msg.text && <p>{renderMessageText(msg.text, setLinkWarning)}</p>}
                          <div className="bubble-footer">
                            <span className="bubble-time">{msg.time}</span>
                            {msg.sender === 'me' && (
                              <span
                                className="bubble-menu-trigger material-symbols-outlined"
                                onClick={() => setOpenMsgMenu(openMsgMenu === msg.id ? null : msg.id)}
                              >more_vert</span>
                            )}
                          </div>
                          {msg.sender === 'me' && openMsgMenu === msg.id && (
                            <div className="bubble-dropdown me" onMouseDown={e => e.stopPropagation()}>
                              <button className="bubble-dropdown-item delete" onClick={() => { setOpenMsgMenu(null); setConfirmDialog({ message: "Delete this message?", onConfirm: () => handleDeleteMessage(msg.id) }); }}>
                                <span className="material-symbols-outlined">delete</span>Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ));
                    return items;
                  }) ?? []
                })()}
                {activeChat.contact?.typing && (
                  <div className="chat-bubble-row them">
                    <div className="bubble-avatar placeholder small">{activeChat.contact?.initials}</div>
                    <div className="chat-bubble them typing-bubble">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="chat-input-area" onSubmit={handleSendMessage}>
                {imagePreview && (
                  <div className="image-preview-wrapper">
                    <img src={imagePreview} alt="preview" className="image-preview" />
                    <button type="button" className="image-preview-remove" onClick={clearImage}>
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                )}
                {imageErrorMsg && (
                  <div className="inbox-error-box" role="alert">
                    {imageErrorMsg}
                  </div>
                )}
                <div className="chat-input-wrapper">
                  {limitError && (
                    <div className="inbox-error-box" role="alert">
                      {limitError}
                    </div>
                  )}
                  <div className={`attach-menu-wrapper${attachMenuOpen ? ' open' : ''}`} onMouseDown={e => e.stopPropagation()}>
                    <span className="material-symbols-outlined attach-icon" onClick={() => setAttachMenuOpen(p => !p)}>add_circle</span>
                    {attachMenuOpen && (
                      <div className="attach-dropdown">
                        <button className="attach-option" onClick={() => { setAttachMenuOpen(false); fileInputRef.current?.click(); }}>
                          <span className="material-symbols-outlined">image</span>Photo
                        </button>
                        <button className="attach-option" onClick={() => { setAttachMenuOpen(false); setScheduleDate(getTodayDateString()); setScheduleTime(""); setScheduleLocation(""); setScheduleNote(""); setShowScheduleModal(true); }}>
                          <span className="material-symbols-outlined">calendar_month</span>Schedule Pickup
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleImageSelect}
                  />
                  <input
                    type="text"
                    placeholder="Type your message..."
                    value={inputText}
                    onChange={(e) => {
                      handleLimitedChange(e.target.value, setInputText, "Message", MESSAGE_MAX_LENGTH);
                      const now = Date.now();
                      if (activeChat?.id && now - lastTypingSentRef.current > 2000) {
                        lastTypingSentRef.current = now;
                        sendTypingSignal(activeChat.id);
                      }
                    }}
                    maxLength={MESSAGE_MAX_LENGTH}
                  />
                  <button type="submit" className="send-btn" disabled={!inputText.trim() && !imageFile}>
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="inbox-listing-details">
          {activeChat?.listings?.map(listing => {
            const isSeller = isCurrentUserSeller(listing, activeChat);
            const removedForSeller = isSeller && listing.removed_by_buyer;
            const activeListings = activeChat.listings.filter(l => !l.removed_by_buyer);
            return (
              <div key={listing.id} className={`listing-card${removedForSeller ? ' removed' : ''}`}>
                <div className="listing-image-wrapper">
                  {listing.image ? (
                    <img src={listing.image} alt={listing.title} className="listing-image" />
                  ) : (
                    <div className="listing-image placeholder">
                      <span className="material-symbols-outlined">image</span>
                    </div>
                  )}
                  {Number(listing.active) === 1 && !removedForSeller && <span className="active-tag">ACTIVE LISTING</span>}
                  {Number(listing.active) === 0 && !removedForSeller && <span className="active-tag inactive-tag">INACTIVE LISTING</span>}
                  {removedForSeller && <span className="active-tag removed-tag">REMOVED BY BUYER</span>}
                </div>
                <div className="listing-info">
                  <div className="listing-title-row">
                    <h3>{listing.title}</h3>
                    <span className="listing-price">${Number(listing.price || 0).toFixed(2)}</span>
                  </div>
                  <div className="listing-tags">
                    {(listing.tag || "GENERAL").split(",").map(t => t.trim()).filter(Boolean).map(t => (
                      <span key={t} className="listing-category">{t}</span>
                    ))}
                  </div>
                  <p className="listing-desc">{listing.description}</p>
                  <div className="listing-actions">
                    {isSeller ? (
                      removedForSeller ? (
                        <button className="btn-remove-listing" onClick={() => setConfirmDialog({ message: `Remove "${listing.title}" from this conversation?`, onConfirm: () => handleRemoveListing(listing.id) })}>
                          <span className="material-symbols-outlined">remove_circle</span>Dismiss
                        </button>
                      ) : Number(listing.active) === 1 ? (
                        <>
                          <button className="btn-mark-sold" onClick={() => {
                            if (activeListings.length > 1) {
                              openSoldBundleModal();
                            } else {
                              setSoldRating(0); setSoldHover(0); setSoldNote(""); setShowSoldModal(listing.id);
                            }
                          }}>
                            <span className="material-symbols-outlined" style={{ marginRight: '5px', fontSize: '18px' }}>task_alt</span>
                            Complete Transaction
                          </button>
                          <button className="btn-edit-listing" onClick={() => listing.is_bundle ? navigate('/bundlepage', { state: { bundleId: listing.id } }) : navigate('/listingpage', { state: { product: listing } })}>Edit Listing</button>
                        </>
                      ) : (
                        <>
                          <div className="waiting-badge" style={{ padding: '8px', background: '#f8f9fa', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hourglass_empty</span>
                            Waiting for buyer completion
                          </div>
                          <button className="btn-edit-listing" onClick={() => handleRelistItem(listing.id)}>
                            <span className="material-symbols-outlined" style={{ marginRight: '5px', fontSize: '18px' }}>refresh</span>
                            Undo / Relist Item
                          </button>
                        </>
                      )
                    ) : (
                      Number(listing.active) === 0 && !listing.reviewed ? (
                        <button className="btn-mark-sold" onClick={() => {
                          const soldUnreviewed = (activeChat.listings || []).filter(l => Number(l.active) === 0 && !l.reviewed && !l.removed_by_buyer);
                          if (soldUnreviewed.length > 1) {
                            openCompleteTransactionModal();
                          } else {
                            setReviewRating(0); setReviewHover(0); setReviewNote(""); setShowReviewModal(listing.id);
                          }
                        }}>
                          <span className="material-symbols-outlined" style={{ marginRight: '5px', fontSize: '18px' }}>task_alt</span>
                          Complete Transaction
                        </button>
                      ) : Number(listing.active) === 0 && listing.reviewed ? (
                        <button className="btn-completed-transaction" onClick={() => setConfirmDialog({ message: `Clear "${listing.title}" from this conversation?`, onConfirm: () => handleRemoveListing(listing.id), confirmLabel: 'Clear Item', confirmStyle: { background: 'var(--dark-green, #009966)' } })}>
                          <span className="material-symbols-outlined" style={{ marginRight: '5px', fontSize: '18px' }}>check_circle</span>
                          Transaction Completed
                        </button>
                      ) : (
                        <>
                          <button className="btn-edit-listing" onClick={() => listing.is_bundle ? navigate('/bundlepage', { state: { bundleId: listing.id } }) : navigate('/listingpage', { state: { product: listing } })}>Go to Listing</button>
                          {activeChat.listings.length > 1 && (
                            <button className="btn-remove-listing" onClick={() => setConfirmDialog({ message: `Remove "${listing.title}" from this conversation?`, onConfirm: () => handleRemoveListing(listing.id) })}>
                              <span className="material-symbols-outlined">remove_circle</span>Remove
                            </button>
                          )}
                        </>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {activeChat && (!activeChat.listings || activeChat.listings.length === 0 || activeChat.listings.every(l => l.removed_by_buyer)) && (
            <div className="all-removed-notice">
              <span className="material-symbols-outlined">inventory_2</span>
              <p>All listings have been removed from this conversation.</p>
              <button className="btn-remove-listing" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setConfirmDialog({ message: "Delete this conversation? This cannot be undone.", onConfirm: handleDeleteConversation })}>
                <span className="material-symbols-outlined">delete</span>Delete Conversation
              </button>
            </div>
          )}
        </div>

      </div>

      {showScheduleModal && (
        <div className="lightbox-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="confirm-dialog sold-modal" onClick={e => e.stopPropagation()} style={{ width: 400 }}>
            <div className="report-modal-header">
              <span className="material-symbols-outlined" style={{ color: 'var(--dark-green)', fontSize: '28px' }}>calendar_month</span>
              <h3>Schedule Pickup</h3>
              <p>Set a time and place to meet with {activeChat?.contact?.name}</p>
            </div>
            <div className="schedule-fields">
              {limitError && (
                <div className="inbox-error-box" role="alert">
                  {limitError}
                </div>
              )}
              <label>Date</label>
              <input
                type="date"
                value={scheduleDate}
                min={getTodayDateString()}
                onChange={e => setScheduleDate(e.target.value)}
              />

              <label>Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
              />

              {/* ----------------------------- */}
              {/*     LOCATION (DROPDOWN)       */}
              {/* ----------------------------- */}
              <label>Location</label>
              <select
                className="location-dropdown"
                value={scheduleLocation}
                onChange={e => setScheduleLocation(e.target.value)}
              >
                <option value="">Select a location</option>
                <option value="Student Union">Student Union</option>
                <option value="CFA (Center for the Arts)">CFA (Center for the Arts)</option>
                <option value="Natural Sciences Complex">Natural Sciences Complex</option>
                <option value="Lockwood Library">Lockwood Library</option>
                <option value="Silverman Library">Silverman Library</option>
                <option value="Abbot Library">Abbot Library</option>
                <option value="Ellicott Food Court">Ellicott Food Court</option>
              </select>

              {scheduleDate && scheduleTime && (
                <a
                  className="maps-link"
                  href={(() => {
                    const s = scheduleDate.replace(/-/g, '') + 'T' + scheduleTime.replace(':', '') + '00';
                    const e = scheduleDate.replace(/-/g, '') + 'T' + (String(parseInt(scheduleTime.split(':')[0]) + 1).padStart(2, '0')) + scheduleTime.split(':')[1] + '00';
                    const t = encodeURIComponent(`Campus Clearout Pickup – ${activeChat?.listings?.[0]?.title || 'Item'}`);
                    const d = encodeURIComponent(scheduleNote || `Meetup with ${activeChat?.contact?.name}`);
                    const l = encodeURIComponent(scheduleLocation);
                    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${t}&dates=${s}/${e}&details=${d}&location=${l}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>calendar_month</span>
                  Preview in Google Calendar
                </a>
              )}
              <label>Note (optional)</label>
              <textarea
                className="report-textarea"
                rows={2}
                placeholder="Any details about the meetup..."
                value={scheduleNote}
                onChange={e =>
                  handleLimitedChange(e.target.value, setScheduleNote, "Note", SCHEDULE_NOTE_MAX_LENGTH)
                }
                maxLength={SCHEDULE_NOTE_MAX_LENGTH}
              />
            </div>
            <div className="confirm-dialog-actions">
              <button className="confirm-cancel" onClick={() => setShowScheduleModal(false)}>
                Cancel
              </button>

              <button
                className="confirm-delete"
                style={{ background: 'var(--dark-green)' }}
                disabled={!scheduleDate || !scheduleTime}
                onClick={async () => {
                  const start = scheduleDate.replace(/-/g, '') + 'T' + scheduleTime.replace(':', '') + '00';
                  const end = scheduleDate.replace(/-/g, '') + 'T' + (String(parseInt(scheduleTime.split(':')[0]) + 1).padStart(2, '0')) + scheduleTime.split(':')[1] + '00';
                  const title = encodeURIComponent(`Campus Clearout Pickup – ${activeChat?.listings?.[0]?.title || 'Item'}`);
                  const details = encodeURIComponent(scheduleNote || `Meetup with ${activeChat?.contact?.name}`);
                  const loc = encodeURIComponent(scheduleLocation);
                  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${loc}`;

                  window.open(calendarUrl, '_blank', 'noopener,noreferrer');

                  const token = localStorage.getItem("token");
                  const dateStr = new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  });

                  let msgText = `Pickup scheduled: ${dateStr}`;
                  if (scheduleLocation) msgText += `\n${scheduleLocation}`;
                  if (scheduleNote) msgText += `\n${scheduleNote}`;
                  msgText += `\n\n[calendar:${calendarUrl}]`;

                  const formData = new FormData();
                  formData.append("chat_id", activeChat.id);
                  formData.append("message", msgText);
                  await fetch(`${API_BASE}/send_message.php`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` },
                    body: formData
                  });
                  loadConversation(activeChat.id);
                  setShowScheduleModal(false);
                }}
              >Add to Google Calendar</button>
            </div>
          </div>
        </div>
      )}

      {showSoldModal && (
        <div className="lightbox-overlay" onClick={() => setShowSoldModal(null)}>
          <div className="confirm-dialog sold-modal" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <span className="material-symbols-outlined" style={{ color: '#f5a623', fontSize: '28px' }}>storefront</span>
              <h3>Rate the Buyer</h3>
              <p>How was your experience with {activeChat?.contact?.name}?</p>
            </div>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map(star => (
                <span
                  key={star}
                  className={`material-symbols-outlined star ${(soldHover || soldRating) >= star ? 'filled' : ''}`}
                  onMouseEnter={() => setSoldHover(star)}
                  onMouseLeave={() => setSoldHover(0)}
                  onClick={() => setSoldRating(star)}
                >star</span>
              ))}
            </div>
          {limitError && (
              <div className="inbox-error-box" role="alert">
                {limitError}
              </div>
            )}
            {/* NEW: Display the single-item sold error */}
            {soldErrorMsg && (
              <div className="inbox-error-box" role="alert">
                {soldErrorMsg}
              </div>
            )}
            <textarea
              className="report-textarea"
              placeholder="Add a note about this transaction (optional)"
              value={soldNote}
              onChange={e =>
                handleLimitedChange(
                  e.target.value,
                  setSoldNote,
                  "Transaction note",
                  TRANSACTION_NOTE_MAX_LENGTH
                )
              }
              rows={3}
              maxLength={TRANSACTION_NOTE_MAX_LENGTH}
            />
            <div className="confirm-dialog-actions">
              <button className="confirm-cancel" onClick={() => setShowSoldModal(null)}>Skip</button>
              <button className="confirm-delete" style={{ background: 'var(--primary-green, #009966)' }} onClick={handleMarkSold}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="lightbox-overlay" onClick={() => setShowReviewModal(null)}>
          <div className="confirm-dialog sold-modal" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <span className="material-symbols-outlined" style={{ color: '#f5a623', fontSize: '28px' }}>task_alt</span>
              <h3>Complete Transaction</h3>
              <p>How was your experience buying from {activeChat?.contact?.name}?</p>
            </div>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map(star => (
                <span
                  key={star}
                  className={`material-symbols-outlined star ${(reviewHover || reviewRating) >= star ? 'filled' : ''}`}
                  onMouseEnter={() => setReviewHover(star)}
                  onMouseLeave={() => setReviewHover(0)}
                  onClick={() => setReviewRating(star)}
                >star</span>
              ))}
            </div>
            {limitError && (
              <div className="inbox-error-box" role="alert">{limitError}</div>
            )}
            {reviewErrorMsg && (
              <div className="inbox-error-box" role="alert">{reviewErrorMsg}</div>
            )}
            <textarea
              className="report-textarea"
              placeholder="Add a note about this transaction (optional)"
              value={reviewNote}
              onChange={e =>
                handleLimitedChange(
                  e.target.value,
                  setReviewNote,
                  "Transaction note",
                  TRANSACTION_NOTE_MAX_LENGTH
                )
              }
              rows={3}
              maxLength={TRANSACTION_NOTE_MAX_LENGTH}
            />
            <div className="confirm-dialog-actions">
              <button className="confirm-cancel" onClick={() => setShowReviewModal(null)}>Cancel</button>
              <button className="confirm-delete" style={{ background: 'var(--primary-green, #009966)' }} onClick={handleSubmitReview}>Complete Transaction</button>
            </div>
          </div>
        </div>
      )}

      {showSoldBundleModal && (
        <div className="lightbox-overlay" onClick={() => setShowSoldBundleModal(false)}>
          <div className="confirm-dialog sold-modal transaction-modal" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <span className="material-symbols-outlined" style={{ color: '#f5a623', fontSize: '28px' }}>storefront</span>
              <h3>Complete Transaction</h3>
              <p>Select the items sold to {activeChat?.contact?.name} and rate the buyer</p>
            </div>
            <div className="transaction-item-list">
              {(activeChat?.listings || []).filter(l => Number(l.active) === 1).map(listing => (
                <label key={listing.id} className={`transaction-item${selectedSoldItems[listing.id] ? ' checked' : ''}`}>
                  <div className="transaction-checkbox">
                    <input
                      type="checkbox"
                      checked={!!selectedSoldItems[listing.id]}
                      onChange={() => setSelectedSoldItems(prev => ({ ...prev, [listing.id]: !prev[listing.id] }))}
                    />
                    <span className="material-symbols-outlined checkmark-icon">
                      {selectedSoldItems[listing.id] ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                  <div className="transaction-item-thumb">
                    {listing.image
                      ? <img src={listing.image} alt={listing.title} />
                      : <div className="thumb-placeholder"><span className="material-symbols-outlined">image</span></div>
                    }
                  </div>
                  <div className="transaction-item-info">
                    <span className="transaction-item-title">{listing.title}</span>
                    <span className="transaction-item-price">${Number(listing.price || 0).toFixed(2)}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map(star => (
                <span
                  key={star}
                  className={`material-symbols-outlined star ${(soldBundleHover || soldBundleRating) >= star ? 'filled' : ''}`}
                  onMouseEnter={() => setSoldBundleHover(star)}
                  onMouseLeave={() => setSoldBundleHover(0)}
                  onClick={() => setSoldBundleRating(star)}
                >star</span>
              ))}
            </div>
          {limitError && (
              <div className="inbox-error-box" role="alert">{limitError}</div>
            )}
            {soldBundleErrorMsg && (
              <div className="inbox-error-box" role="alert">{soldBundleErrorMsg}</div>
            )}
            <textarea
              className="report-textarea"
              placeholder="Add a note about this transaction (optional)"
              value={soldBundleNote}
              onChange={e =>
                handleLimitedChange(
                  e.target.value,
                  setSoldBundleNote,
                  "Transaction note",
                  TRANSACTION_NOTE_MAX_LENGTH
                )
              }
              rows={3}
              maxLength={TRANSACTION_NOTE_MAX_LENGTH}
            />
            <div className="confirm-dialog-actions">
              <button className="confirm-cancel" onClick={() => setShowSoldBundleModal(false)}>Cancel</button>
              <button
                className="confirm-delete"
                style={{ background: 'var(--primary-green, #009966)' }}
                disabled={Object.values(selectedSoldItems).filter(Boolean).length === 0 || soldBundleRating < 1}
                onClick={handleMarkSoldBundle}
              >Complete Transaction</button>
            </div>
          </div>
        </div>
      )}

      {showCompleteTransactionModal && (
        <div className="lightbox-overlay" onClick={() => setShowCompleteTransactionModal(false)}>
          <div className="confirm-dialog sold-modal transaction-modal" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <span className="material-symbols-outlined" style={{ color: '#f5a623', fontSize: '28px' }}>shopping_cart_checkout</span>
              <h3>Complete Transaction</h3>
              <p>Confirm the items you purchased from {activeChat?.contact?.name}</p>
            </div>
            <div className="transaction-item-list">
              {(activeChat?.listings || []).filter(l => Number(l.active) === 0 && !l.reviewed && !l.removed_by_buyer).map(listing => (
                <label key={listing.id} className={`transaction-item${selectedTransactionItems[listing.id] ? ' checked' : ''}`}>
                  <div className="transaction-checkbox">
                    <input
                      type="checkbox"
                      checked={!!selectedTransactionItems[listing.id]}
                      onChange={() => setSelectedTransactionItems(prev => ({ ...prev, [listing.id]: !prev[listing.id] }))}
                    />
                    <span className="material-symbols-outlined checkmark-icon">
                      {selectedTransactionItems[listing.id] ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                  <div className="transaction-item-thumb">
                    {listing.image
                      ? <img src={listing.image} alt={listing.title} />
                      : <div className="thumb-placeholder"><span className="material-symbols-outlined">image</span></div>
                    }
                  </div>
                  <div className="transaction-item-info">
                    <span className="transaction-item-title">{listing.title}</span>
                    <span className="transaction-item-price">${Number(listing.price || 0).toFixed(2)}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map(star => (
                <span
                  key={star}
                  className={`material-symbols-outlined star ${(transactionHover || transactionRating) >= star ? 'filled' : ''}`}
                  onMouseEnter={() => setTransactionHover(star)}
                  onMouseLeave={() => setTransactionHover(0)}
                  onClick={() => setTransactionRating(star)}
                >star</span>
              ))}
            </div>
            {limitError && (
              <div className="inbox-error-box" role="alert">{limitError}</div>
            )}
            {transactionErrorMsg && (
              <div className="inbox-error-box" role="alert">{transactionErrorMsg}</div>
            )}
            <textarea
              className="report-textarea"
              placeholder="Add a note about your experience (optional)"
              value={transactionNote}
              onChange={e =>
                handleLimitedChange(
                  e.target.value,
                  setTransactionNote,
                  "Transaction note",
                  TRANSACTION_NOTE_MAX_LENGTH
                )
              }
              rows={3}
              maxLength={TRANSACTION_NOTE_MAX_LENGTH}
            />
            <div className="confirm-dialog-actions">
              <button className="confirm-cancel" onClick={() => setShowCompleteTransactionModal(false)}>Cancel</button>
              <button
                className="confirm-delete"
                style={{ background: 'var(--primary-green, #009966)' }}
                disabled={Object.values(selectedTransactionItems).filter(Boolean).length === 0 || transactionRating < 1}
                onClick={handleCompleteTransaction}
              >Complete Transaction</button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="lightbox-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>{confirmDialog.message}</p>
            <div className="confirm-dialog-actions">
              <button className="confirm-cancel" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button className="confirm-delete" style={confirmDialog.confirmStyle || {}} onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}>{confirmDialog.confirmLabel || "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {linkWarning && (
        <div className="lightbox-overlay" onClick={() => setLinkWarning(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <span className="material-symbols-outlined" style={{ color: '#f5a623', fontSize: '28px' }}>open_in_new</span>
              <h3>External Link</h3>
              <p>This link will take you to an external website:</p>
              <p style={{ wordBreak: 'break-all', fontSize: '12px', color: 'var(--text-secondary)' }}>{linkWarning}</p>
            </div>
            <div className="confirm-dialog-actions">
              <button className="confirm-cancel" onClick={() => setLinkWarning(null)}>Cancel</button>
              <button className="confirm-delete" style={{ background: '#f5a623' }} onClick={() => { window.open(linkWarning, '_blank', 'noopener,noreferrer'); setLinkWarning(null); }}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="full size" className="lightbox-img" onClick={e => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default Inbox;
