import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  Search,
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

export default function Navbar({ onMenu = null }) {
  const { user, profile, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsError, setAnnouncementsError] = useState("");

  useEffect(() => {
    if (location.pathname === "/library" || location.pathname === "/student/search") {
      const params = new URLSearchParams(location.search);
      setQuery(params.get("search") || "");
    }

    setNotificationsOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") setNotificationsOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  // Live school announcements for the signed-in user (filtered by audience + expiry)
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

  const unreadCount = announcements.length;

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
                onClick={() => setNotificationsOpen((open) => !open)}
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
                  style={{ minWidth: 320, maxWidth: 380, maxHeight: 420, overflowY: "auto" }}
                >
                  <strong>Announcements</strong>
                  {announcementsError ? (
                    <p style={{ color: "#b91c1c" }}>{announcementsError}</p>
                  ) : announcements.length === 0 ? (
                    <p>You are all caught up. New school announcements will appear here.</p>
                  ) : (
                    <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "grid", gap: "0.65rem" }}>
                      {announcements.map((item) => (
                        <li
                          key={item.id}
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: 12,
                            padding: "0.7rem 0.8rem",
                            background: item.priority === "urgent" ? "#fef2f2" : item.priority === "important" ? "#fff7ed" : "#f8fafc",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                color: item.priority === "urgent" ? "#b91c1c" : item.priority === "important" ? "#c2410c" : "#475569",
                              }}
                            >
                              {item.priority || "normal"}
                            </span>
                            <small style={{ color: "#64748b" }}>{formatAnnouncementTime(item.createdAt)}</small>
                          </div>
                          <strong style={{ display: "block", fontSize: "0.95rem" }}>{item.title}</strong>
                          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#334155", whiteSpace: "pre-wrap" }}>
                            {item.message}
                          </p>
                          <small style={{ display: "block", marginTop: 6, color: "#94a3b8" }}>
                            {item.audience === "class"
                              ? `${item.grade || ""} ${item.section || ""}`.trim() || "Class"
                              : item.audience === "teachers"
                                ? "Teachers"
                                : item.audience === "students"
                                  ? "Students"
                                  : "All users"}
                            {item.createdByName ? ` · ${item.createdByName}` : ""}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
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
