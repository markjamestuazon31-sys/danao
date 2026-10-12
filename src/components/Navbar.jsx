import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ProfileAvatar from "./ProfileAvatar";
import { useAuth } from "../context/AuthContext";
import { logout } from "../services/authService";
import { subscribeVisibleAnnouncements } from "../services/adminOperationsService";

const DASHBOARD_ROUTES = {
  admin: "/admin/dashboard",
  teacher: "/teacher/dashboard",
  student: "/student/profile",
};

function formatAnnouncementTime(value) {
  const date = new Date(Number(value) || value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function audienceLabel(item) {
  if (item.audience === "class") {
    return `${item.grade || ""} ${item.section || ""}`.trim() || "Specific class";
  }
  if (item.audience === "teachers") return "Teachers";
  if (item.audience === "students") return "Students";
  return "All users";
}

function priorityStyles(priority) {
  if (priority === "urgent") {
    return { bg: "#fef2f2", border: "#fecaca", badge: "#b91c1c", badgeBg: "#fee2e2" };
  }
  if (priority === "important") {
    return { bg: "#fff7ed", border: "#fed7aa", badge: "#c2410c", badgeBg: "#ffedd5" };
  }
  return { bg: "#f8fafc", border: "#e2e8f0", badge: "#475569", badgeBg: "#e2e8f0" };
}

function readStorageKey(uid) {
  return `jidanao-announcement-reads:${uid || "guest"}`;
}

function loadReadIds(uid) {
  try {
    const raw = window.localStorage.getItem(readStorageKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(uid, ids) {
  try {
    window.localStorage.setItem(readStorageKey(uid), JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode errors
  }
}

export default function Navbar({ onMenu = null }) {
  const { user, profile, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsError, setAnnouncementsError] = useState("");
  const [readIds, setReadIds] = useState(() => loadReadIds(user?.uid));

  useEffect(() => {
    if (location.pathname === "/library" || location.pathname === "/student/search") {
      const params = new URLSearchParams(location.search);
      setQuery(params.get("search") || "");
    }
    setNotificationsOpen(false);
    setSelectedAnnouncement(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      if (selectedAnnouncement) {
        setSelectedAnnouncement(null);
        return;
      }
      setNotificationsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedAnnouncement]);

  useEffect(() => {
    setReadIds(loadReadIds(user?.uid));
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setAnnouncements([]);
      setAnnouncementsError("");
      return undefined;
    }
    setAnnouncementsError("");
    const unsubscribe = subscribeVisibleAnnouncements(
      { role, profile },
      (list) => setAnnouncements(list),
      (error) => {
        console.warn("Unable to load announcements:", error);
        setAnnouncementsError(error?.message || "Unable to load announcements.");
        setAnnouncements([]);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user?.uid, role, profile?.gradeLevel, profile?.grade, profile?.section, profile?.role]);

  const unreadAnnouncements = announcements.filter((item) => !readIds.has(String(item.id)));
  const unreadCount = unreadAnnouncements.length;

  function markAnnouncementsRead(ids) {
    if (!ids?.length) return;
    setReadIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(String(id)));
      saveReadIds(user?.uid, next);
      return next;
    });
  }

  function markAllVisibleRead() {
    markAnnouncementsRead(announcements.map((item) => item.id));
  }

  function handleSearch(event) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    const search = trimmedQuery ? `?search=${encodeURIComponent(trimmedQuery)}` : "";
    navigate(role === "student" ? `/student/search${search}` : `/library${search}`);
  }

  async function handleLogout() {
    if (signingOut) return;
    try {
      setSigningOut(true);
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Unable to sign out:", error);
    } finally {
      setSigningOut(false);
    }
  }

  function openAnnouncement(item) {
    if (item?.id) markAnnouncementsRead([item.id]);
    setSelectedAnnouncement(item);
  }

  function closeAnnouncementDetail() {
    setSelectedAnnouncement(null);
  }

  function closeNotifications() {
    setSelectedAnnouncement(null);
    setNotificationsOpen(false);
  }

  const profileRoute = DASHBOARD_ROUTES[role] || "/library";
  const profileSubtitle = role === "student" ? profile?.gradeLevel : role || "member";
  const isPublicHome = location.pathname === "/";

  return (
    <header className={`lms-topbar ${role ? `role-${role}-topbar` : ""} ${isPublicHome ? "lms-public-home-topbar" : ""}`}>
      <div className="lms-topbar__left">
        {onMenu && (
          <button
            className="lms-icon-button lms-menu-button"
            type="button"
            onClick={onMenu}
            aria-label="Open navigation menu"
          >
            <Menu size={21} aria-hidden="true" />
          </button>
        )}

        <Link to="/" className="lms-mobile-brand" aria-label="Jidanao Learning Hub home">
          <img src="/school-logo.jpg" alt="" />
          <span>Jidanao Learning Hub</span>
        </Link>

        {isPublicHome && (
          <>
            <Link to="/" className="lms-public-brand" aria-label="Jidanao Elementary School home">
              <img src="/school-logo.jpg" alt="" />
              <span>Jidanao Elementary School</span>
            </Link>
            <nav className="lms-public-nav" aria-label="Public website navigation">
              <Link className={!location.hash ? "is-active" : ""} to="/">Home</Link>
              <Link className={location.hash === "#learning-games" ? "is-active" : ""} to="/#learning-games">Learning Games</Link>
              <Link className={location.hash === "#featured-lessons" ? "is-active" : ""} to="/#featured-lessons">Lessons</Link>
              <Link className={location.hash === "#about-us" ? "is-active" : ""} to="/#about-us">About</Link>
              <Link className={location.hash === "#help-center" ? "is-active" : ""} to="/#help-center">Help</Link>
            </nav>
          </>
        )}

        <form className={`lms-global-search ${isPublicHome ? "lms-global-search--home-hidden" : ""}`} role="search" onSubmit={handleSearch}>
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="global-learning-search">
            Search lessons, games, and topics
          </label>
          <input
            id="global-learning-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search lessons, games, topics..."
            autoComplete="off"
          />
        </form>
      </div>

      <div className="lms-topbar__actions">
        {user ? (
          <>
            <div className="lms-notification-wrap">
              <button
                className="lms-icon-button"
                type="button"
                aria-label={unreadCount ? `Open notifications, ${unreadCount} announcements` : "Open notifications"}
                aria-expanded={notificationsOpen}
                aria-controls="notification-panel"
                onClick={() => {
                  setNotificationsOpen((open) => {
                    const next = !open;
                    if (next) {
                      // Opening the panel clears the badge
                      markAnnouncementsRead(announcements.map((item) => item.id));
                    }
                    return next;
                  });
                  setSelectedAnnouncement(null);
                }}
                style={{ position: "relative" }}
              >
                <Bell size={19} aria-hidden="true" />
                {unreadCount > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      minWidth: 16,
                      height: 16,
                      padding: "0 4px",
                      borderRadius: 999,
                      background: "#dc2626",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: "16px",
                      textAlign: "center",
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div
                  id="notification-panel"
                  className="lms-notification-panel"
                  role="region"
                  aria-label="School announcements"
                  style={{
                    width: 380,
                    maxWidth: "min(380px, calc(100vw - 24px))",
                    maxHeight: 480,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    padding: 0,
                    borderRadius: 16,
                    boxShadow: "0 18px 50px rgba(15, 23, 42, 0.18)",
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "14px 16px",
                      borderBottom: "1px solid #e2e8f0",
                      background: "linear-gradient(180deg, #f8fafc 0%, #fff 100%)",
                    }}
                  >
                    <div>
                      <strong style={{ display: "block", fontSize: "0.95rem", color: "#0f172a" }}>
                        {selectedAnnouncement ? "Announcement" : "School announcements"}
                      </strong>
                      <small style={{ color: "#64748b" }}>
                        {selectedAnnouncement
                          ? "Full message"
                          : announcements.length
                            ? (unreadCount
                                ? `${unreadCount} new · ${announcements.length} total`
                                : `${announcements.length} notice${announcements.length === 1 ? "" : "s"} · all read`)
                            : "No notices"}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={selectedAnnouncement ? closeAnnouncementDetail : closeNotifications}
                      aria-label={selectedAnnouncement ? "Back to list" : "Close notifications"}
                      style={{
                        border: "none",
                        background: "#f1f5f9",
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#334155",
                      }}
                    >
                      {selectedAnnouncement ? <ArrowLeft size={16} /> : <X size={16} />}
                    </button>
                  </div>

                  {/* Body */}
                  <div style={{ overflowY: "auto", flex: 1, padding: selectedAnnouncement ? 0 : "10px 12px 14px" }}>
                    {selectedAnnouncement ? (
                      (() => {
                        const styles = priorityStyles(selectedAnnouncement.priority);
                        return (
                          <article style={{ padding: "18px 18px 22px" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                  color: styles.badge,
                                  background: styles.badgeBg,
                                  borderRadius: 999,
                                  padding: "4px 10px",
                                }}
                              >
                                {selectedAnnouncement.priority || "normal"}
                              </span>
                              <small style={{ color: "#64748b" }}>
                                {formatAnnouncementTime(selectedAnnouncement.createdAt)}
                              </small>
                            </div>

                            <h3 style={{ margin: "0 0 10px", fontSize: "1.15rem", lineHeight: 1.35, color: "#0f172a" }}>
                              {selectedAnnouncement.title}
                            </h3>

                            <div
                              style={{
                                margin: 0,
                                padding: "14px 16px",
                                borderRadius: 12,
                                background: styles.bg,
                                border: `1px solid ${styles.border}`,
                                color: "#1e293b",
                                fontSize: "0.95rem",
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {selectedAnnouncement.message}
                            </div>

                            <div
                              style={{
                                marginTop: 16,
                                paddingTop: 14,
                                borderTop: "1px solid #e2e8f0",
                                display: "grid",
                                gap: 6,
                                fontSize: "0.82rem",
                                color: "#64748b",
                              }}
                            >
                              <div><strong style={{ color: "#475569" }}>Audience:</strong> {audienceLabel(selectedAnnouncement)}</div>
                              {selectedAnnouncement.createdByName && (
                                <div><strong style={{ color: "#475569" }}>From:</strong> {selectedAnnouncement.createdByName}</div>
                              )}
                              {selectedAnnouncement.expiresAt ? (
                                <div>
                                  <strong style={{ color: "#475569" }}>Valid until:</strong>{" "}
                                  {formatAnnouncementTime(selectedAnnouncement.expiresAt)}
                                </div>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              onClick={closeAnnouncementDetail}
                              style={{
                                marginTop: 18,
                                width: "100%",
                                border: "1px solid #cbd5e1",
                                background: "#fff",
                                borderRadius: 10,
                                padding: "10px 14px",
                                fontWeight: 600,
                                color: "#0f172a",
                                cursor: "pointer",
                              }}
                            >
                              Back to announcements
                            </button>
                          </article>
                        );
                      })()
                    ) : announcementsError ? (
                      <p style={{ color: "#b91c1c", margin: "8px 4px" }}>{announcementsError}</p>
                    ) : announcements.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 12px", color: "#64748b" }}>
                        <Bell size={28} style={{ marginBottom: 8, opacity: 0.45 }} />
                        <p style={{ margin: 0, fontWeight: 600, color: "#334155" }}>You are all caught up</p>
                        <p style={{ margin: "6px 0 0", fontSize: "0.875rem" }}>
                          New school announcements will appear here.
                        </p>
                      </div>
                    ) : (
                      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                        {announcements.map((item) => {
                          const styles = priorityStyles(item.priority);
                          const preview = String(item.message || "").replace(/\s+/g, " ").trim();
                          const shortPreview = preview.length > 90 ? `${preview.slice(0, 90)}…` : preview;
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => openAnnouncement(item)}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  border: `1px solid ${styles.border}`,
                                  borderRadius: 12,
                                  padding: "12px 12px 11px",
                                  background: styles.bg,
                                  cursor: "pointer",
                                  transition: "transform 0.12s ease, box-shadow 0.12s ease",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      letterSpacing: "0.04em",
                                      textTransform: "uppercase",
                                      color: styles.badge,
                                      background: styles.badgeBg,
                                      borderRadius: 999,
                                      padding: "3px 8px",
                                    }}
                                  >
                                    {item.priority || "normal"}
                                  </span>
                                  <small style={{ color: "#64748b" }}>{formatAnnouncementTime(item.createdAt)}</small>
                                </div>
                                <strong style={{ display: "block", fontSize: "0.92rem", color: "#0f172a", lineHeight: 1.3 }}>
                                  {item.title}
                                </strong>
                                <p style={{ margin: "5px 0 0", fontSize: "0.84rem", color: "#475569", lineHeight: 1.4 }}>
                                  {shortPreview}
                                </p>
                                <small style={{ display: "block", marginTop: 8, color: "#94a3b8" }}>
                                  {audienceLabel(item)}
                                  {item.createdByName ? ` · ${item.createdByName}` : ""}
                                  {" · Click to read full message"}
                                </small>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link className="lms-profile-chip" to={profileRoute} aria-label="Open profile">
              <ProfileAvatar
                uid={user.uid}
                name={profile?.name || user.email}
                size={34}
                decorative
              />
              <span>
                <strong>{profile?.name || user.email}</strong>
                <small>{profileSubtitle}</small>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </Link>

            <button
              className="lms-signout-button"
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
            >
              <LogOut size={17} aria-hidden="true" />
              <span>{signingOut ? "Signing out..." : "Sign out"}</span>
            </button>
          </>
        ) : (
          <Link className="lms-login-button" to="/login">
            <LogIn size={17} aria-hidden="true" />
            Login
          </Link>
        )}
      </div>
    </header>
  );
}
