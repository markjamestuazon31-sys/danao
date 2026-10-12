import {
  BookOpenCheck,
  Filter,
  Gamepad2,
  LoaderCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import StudentLearningCard from "../components/student/StudentLearningCard";
import VoiceSettings from "../components/student/VoiceSettings";
import { useAuth } from "../context/AuthContext";
import { subjectsForGrade } from "../data/curriculum";
import { getGradeExperience } from "../data/gradeExperience";
import {
  normalizeProgress,
  subscribePublishedCatalogForGrade,
  subscribeUserProgress,
} from "../services/dataService";

function activityStatus(item, progress) {
  if (item.type === "game") {
    const record = progress.game?.[item.id] || {};
    if (Number(item.totalLevels) === 10) {
      if (record.certificateEligible) return "completed";
      if (record.lastPlayedAt) return "started";
      return "not-started";
    }
    if (Number(record.bestStars || record.stars || 0) >= 3) return "completed";
    if (record.lastPlayedAt) return "started";
    return "not-started";
  }
  const record = progress.lesson?.[item.id] || {};
  if (record.completed) return "completed";
  if (record.startedAt || record.percent) return "started";
  return "not-started";
}

export default function StudentCatalogPage({ type }) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [progress, setProgress] = useState(() => normalizeProgress({}));
  const [subject, setSubject] = useState("All Subjects");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recommended");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isGame = type === "game";
  const Icon = isGame ? Gamepad2 : BookOpenCheck;
  const title = isGame ? "Learning Games" : "My Lessons";
  const experience = getGradeExperience(profile?.gradeLevel);
  const subjectOptions = useMemo(() => subjectsForGrade(profile?.gradeLevel), [profile?.gradeLevel]);

  useEffect(() => {
    if (subject === "All Subjects" || subjectOptions.includes(subject)) return;
    setSubject("All Subjects");
  }, [subject, subjectOptions]);

  useEffect(() => {
    if (!profile?.gradeLevel) return undefined;
    setLoading(true);
    setError("");
    return subscribePublishedCatalogForGrade(
      profile.gradeLevel,
      (catalog) => {
        setItems(catalog.filter((item) => item.type === type));
        setLoading(false);
      },
      (loadError) => {
        console.error(`Unable to load student ${type} catalog:`, loadError);
        setError(loadError.message || `Unable to load ${title.toLowerCase()}.`);
        setLoading(false);
      },
      profile.section,
      profile.classKey,
    );
  }, [profile?.gradeLevel, profile?.section, profile?.classKey, title, type]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeUserProgress(user.uid, setProgress, (loadError) => {
      console.warn("Unable to load student progress:", loadError);
    });
  }, [user?.uid]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesSubject = subject === "All Subjects" || item.subject === subject;
      const matchesStatus = status === "all" || activityStatus(item, progress) === status;
      const matchesSearch =
        !term ||
        [item.title, item.description, item.subject, item.competency]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      return matchesSubject && matchesStatus && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "title") return String(a.title).localeCompare(String(b.title));
      if (sort === "newest") return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
      const order = { started: 0, "not-started": 1, completed: 2 };
      return order[activityStatus(a, progress)] - order[activityStatus(b, progress)];
    });
  }, [items, progress, search, sort, status, subject]);

  const counts = useMemo(() => ({
    all: items.length,
    started: items.filter((item) => activityStatus(item, progress) === "started").length,
    completed: items.filter((item) => activityStatus(item, progress) === "completed").length,
  }), [items, progress]);

  return (
    <div className={`student-portal student-catalog-page student-theme--${experience.theme}`}>
      <header className="student-page-hero">
        <div className="student-page-hero__icon"><Icon size={30} /></div>
        <div>
          <span>{profile?.gradeLevel} LEARNING LIBRARY</span>
          <h1>{title}</h1>
          <p>
            {isGame
              ? "Practice skills through levels, timers, scores, sounds, rewards, and adaptive challenges."
              : "Open interactive lessons with examples, practice, quizzes, challenges, narration, and connected games."}
          </p>
        </div>
        <div className="student-page-hero__tools">
          <VoiceSettings compact />
          <strong>{items.length}</strong>
          <small>available</small>
        </div>
      </header>

      <section className="student-library-summary" aria-label={`${title} summary`}>
        <button type="button" className={status === "all" ? "is-active" : ""} onClick={() => setStatus("all")}>
          <span>All</span><strong>{counts.all}</strong>
        </button>
        <button type="button" className={status === "started" ? "is-active" : ""} onClick={() => setStatus("started")}>
          <span>In progress</span><strong>{counts.started}</strong>
        </button>
        <button type="button" className={status === "completed" ? "is-active" : ""} onClick={() => setStatus("completed")}>
          <span>{isGame ? "Mastered" : "Completed"}</span><strong>{counts.completed}</strong>
        </button>
      </section>

      <section className="student-library-toolbar">
        <label className="student-library-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${isGame ? "games" : "lessons"}, skills, or subjects…`}
          />
        </label>
        <label>
          <Filter size={16} />
          <select value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option>All Subjects</option>
            {subjectOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <SlidersHorizontal size={16} />
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="recommended">Recommended</option>
            <option value="newest">Newest</option>
            <option value="title">Title A–Z</option>
          </select>
        </label>
      </section>

      {loading ? (
        <div className="student-state-card"><LoaderCircle className="spin" size={30} /><div><strong>Preparing your {title.toLowerCase()}…</strong><p>Loading teacher-approved {profile?.gradeLevel} content.</p></div></div>
      ) : error ? (
        <div className="student-state-card student-state-card--error">
          <Icon size={30} />
          <div><strong>Unable to load the learning library.</strong><p>{/index|permission|denied/i.test(error) ? "Deploy database.rules.json and sync the student catalog from the Admin Learning Content page." : error}</p></div>
          <button type="button" onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : visibleItems.length ? (
        <div className="student-learning-grid-v2 student-learning-grid-v2--catalog">
          {visibleItems.map((item) => <StudentLearningCard key={item.id} item={item} progress={progress} />)}
        </div>
      ) : (
        <div className="student-state-card student-state-card--empty">
          <Icon size={30} />
          <div>
            <strong>No matching {isGame ? "games" : "lessons"} found.</strong>
            <p>{items.length ? "Change the search or filters to see more activities." : `An administrator has not synced published ${profile?.gradeLevel} content yet.`}</p>
          </div>
        </div>
      )}
    </div>
  );
}
