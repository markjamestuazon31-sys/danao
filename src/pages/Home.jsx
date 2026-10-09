import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Bot,
  Camera,
  CheckCircle2,
  CircleHelp,
  Gamepad2,
  GraduationCap,
  Heart,
  LockKeyhole,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import FeaturedLearningCard from "../components/FeaturedLearningCard";
import HomeGameCard from "../components/HomeGameCard";
import HomeHeroArtwork from "../components/HomeHeroArtwork";
import { GRADES } from "../data/catalog";
import { systemCatalogForGrade } from "../data/gradeExperience";
import { getPublishedCatalog } from "../services/dataService";
import "../styles/home-professional-refresh.css";

const GRADE_FILTERS = ["All Grades", ...GRADES];
const APPROVED_SYSTEM_GAME_ROUTES = new Set([
  "/student/camera-math",
  "/student/camera-reading-english",
  "/student/camera-sort",
  "/student/camera-sentence",
  "/student/camera-spelling",
  "/student/camera-picture",
  "/student/camera-truefalse",
]);
const RETIRED_DEMO_TITLES = new Set([
  "learning game",
  "math adventure",
  "science sort",
]);

const BENEFITS = [
  {
    icon: BookOpenCheck,
    title: "Structured Lessons",
    text: "Well-organized modules with reading materials, activities, and assessments.",
    tone: "purple",
  },
  {
    icon: Gamepad2,
    title: "Game-Based Learning",
    text: "Age-appropriate challenges that make practice exciting and meaningful.",
    tone: "green",
  },
  {
    icon: Bot,
    title: "AI-Assisted Teaching",
    text: "Smart tools help teachers prepare content that they review before use.",
    tone: "blue",
  },
  {
    icon: BarChart3,
    title: "Progress Tracking",
    text: "Learners and teachers can monitor growth, scores, and milestones.",
    tone: "orange",
  },
  {
    icon: ShieldCheck,
    title: "Safe & Secure",
    text: "Role-based access for students, teachers, and school administrators.",
    tone: "indigo",
  },
];

const HOW_IT_WORKS = [
  {
    icon: MousePointerClick,
    step: "01",
    title: "Choose a learning activity",
    text: "Browse by grade level, subject, lesson, or educational game.",
  },
  {
    icon: BookOpen,
    step: "02",
    title: "Learn and practice",
    text: "Read, listen, answer quizzes, and complete interactive challenges.",
  },
  {
    icon: Trophy,
    step: "03",
    title: "Track every milestone",
    text: "Review progress, scores, achievements, and earned certificates.",
  },
];

function normalizeGrade(grade) {
  if (!grade) return "All Grades";

  const value = String(grade).trim();
  return /^grade\s/i.test(value) ? value : `Grade ${value}`;
}

function isRealPublishedContent(item) {
  if (!item || !["lesson", "game"].includes(item.type)) return false;
  if (item.status !== "published" || !GRADES.includes(normalizeGrade(item.grade))) return false;
  if (item.demo === true || item.sample === true || item.source === "demo") return false;

  const title = String(item.title || "").trim().toLowerCase();
  if (!title || RETIRED_DEMO_TITLES.has(title)) return false;

  if (item.builtIn) {
    return item.source === "system"
      && item.type === "game"
      && APPROVED_SYSTEM_GAME_ROUTES.has(item.route);
  }

  return Boolean(item.teacherId);
}

function mergeCatalog(remoteItems) {
  const merged = new Map();
  const sortedRemote = [...remoteItems]
    .filter(isRealPublishedContent)
    .sort((first, second) => {
      const systemDifference = Number(Boolean(second.builtIn)) - Number(Boolean(first.builtIn));
      if (systemDifference !== 0) return systemDifference;
      return (second.createdAt || 0) - (first.createdAt || 0);
    });

  sortedRemote.forEach((item) => {
    const key = `${item.type}-${item.id}`;
    if (!merged.has(key)) merged.set(key, item);
  });

  return [...merged.values()];
}

const PUBLIC_HOME_CATALOG = mergeCatalog(
  GRADES.flatMap((grade) => systemCatalogForGrade(grade)),
);

export default function Home() {
  const location = useLocation();
  const [catalog, setCatalog] = useState(PUBLIC_HOME_CATALOG);
  const [selectedGrade, setSelectedGrade] = useState("All Grades");
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  useEffect(() => {
    if (!location.hash) return undefined;

    const timer = window.setTimeout(() => {
      const target = document.getElementById(location.hash.slice(1));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);

    return () => window.clearTimeout(timer);
  }, [location.hash]);

  useEffect(() => {
    let active = true;

    async function loadPublishedContent() {
      try {
        const published = await getPublishedCatalog();
        if (active) setCatalog(mergeCatalog([...PUBLIC_HOME_CATALOG, ...published]));
      } catch (error) {
        console.info(
          "Published content is not publicly readable yet. Showing the built-in catalog instead.",
          error,
        );
      } finally {
        if (active) setLoadingCatalog(false);
      }
    }

    loadPublishedContent();
    return () => {
      active = false;
    };
  }, []);

  const featuredLessons = useMemo(() => {
    const matchingItems = catalog.filter(
      (item) =>
        item.type === "lesson" &&
        (selectedGrade === "All Grades" || normalizeGrade(item.grade) === selectedGrade),
    );

    return [...matchingItems]
      .sort((first, second) => {
        const featuredDifference = Number(Boolean(second.featured)) - Number(Boolean(first.featured));
        if (featuredDifference !== 0) return featuredDifference;
        return (second.createdAt || 0) - (first.createdAt || 0);
      })
      .slice(0, 4);
  }, [catalog, selectedGrade]);

  const visibleGames = useMemo(() => {
    return catalog
      .filter(
        (item) =>
          item.type === "game" &&
          (selectedGrade === "All Grades" || normalizeGrade(item.grade) === selectedGrade),
      )
      .sort((first, second) => {
        const systemDifference = Number(Boolean(second.builtIn)) - Number(Boolean(first.builtIn));
        if (systemDifference !== 0) return systemDifference;
        const gradeDifference = normalizeGrade(first.grade).localeCompare(normalizeGrade(second.grade));
        if (gradeDifference !== 0) return gradeDifference;
        return String(first.title || "").localeCompare(String(second.title || ""));
      });
  }, [catalog, selectedGrade]);

  const lessonCount = catalog.filter((item) => item.type === "lesson").length;
  const gameCount = catalog.filter((item) => item.type === "game").length;
  const coveredGrades = new Set(
    catalog.map((item) => normalizeGrade(item.grade)).filter((grade) => grade !== "All Grades"),
  ).size;

  const statistics = [
    {
      icon: BookOpen,
      value: lessonCount,
      label: "Lessons Available",
      tone: "purple",
    },
    {
      icon: Gamepad2,
      value: gameCount,
      label: "Educational Games",
      tone: "green",
    },
    {
      icon: GraduationCap,
      value: coveredGrades || 4,
      label: "Grade Levels",
      tone: "blue",
    },
    {
      icon: CheckCircle2,
      value: "Required",
      label: "Teacher Review",
      tone: "orange",
    },
  ];

  return (
    <div className="home-v2 home-v2--school">
      <section className="home-hero-v2" aria-labelledby="home-hero-title">
        <div className="home-hero-v2__copy">
          <span className="home-hero-v2__trust">
            <ShieldCheck size={15} aria-hidden="true" />
            School-managed digital learning platform
          </span>
          <span className="home-hero-v2__eyebrow">Jidanao Elementary School</span>
          <h1 id="home-hero-title">
            Where young minds <span>learn, play, and grow.</span>
          </h1>
          <p>
            One professional learning space for Grades 3–6—with teacher-guided
            lessons, interactive camera games, reading practice, achievements,
            and progress that follows every learner.
          </p>

          <div className="home-hero-v2__actions">
            <Link className="home-hero-v2__primary" to="/#learning-games">
              <Gamepad2 size={18} aria-hidden="true" />
              Explore All Games
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="home-hero-v2__secondary" to="/login">
              <LockKeyhole size={18} aria-hidden="true" />
              Student Login
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>

          <div className="home-hero-v2__highlights" aria-label="Learning hub highlights">
            <span>
              <GraduationCap size={15} aria-hidden="true" /> Grades 3–6
            </span>
            <span>
              <Camera size={15} aria-hidden="true" /> Camera-powered
            </span>
            <span>
              <Trophy size={15} aria-hidden="true" /> Progress & certificates
            </span>
          </div>
        </div>

        <HomeHeroArtwork />

        <div className="home-hero-v2__review-note">
          <span aria-hidden="true"><LockKeyhole size={14} /></span>
          <p>Games can be viewed publicly. A verified student login is required to play and save progress.</p>
        </div>
      </section>

      <section id="grade-levels" className="home-grade-filter" aria-labelledby="grade-filter-title">
        <div className="home-grade-filter__title">
          <GraduationCap size={23} aria-hidden="true" />
          <h2 id="grade-filter-title">Browse by Grade Level</h2>
        </div>

        <div className="home-grade-filter__options" role="group" aria-label="Filter featured content by grade">
          {GRADE_FILTERS.map((grade, index) => (
            <button
              key={grade}
              type="button"
              className={`home-grade-chip home-grade-chip--${index} ${
                selectedGrade === grade ? "is-selected" : ""
              }`}
              aria-pressed={selectedGrade === grade}
              onClick={() => setSelectedGrade(grade)}
            >
              <span aria-hidden="true" />
              {grade}
            </button>
          ))}
        </div>
      </section>

      <section id="learning-games" className="home-game-showcase" aria-labelledby="all-games-title">
        <div className="home-game-showcase__heading">
          <div className="home-game-showcase__heading-copy">
            <span className="home-game-showcase__heading-icon">
              <Gamepad2 size={24} aria-hidden="true" />
            </span>
            <div>
              <span className="home-section-v2__eyebrow">Jidanao interactive learning arcade</span>
              <h2 id="all-games-title">All Learning Games</h2>
              <p>
                Preview every available game below. Activities automatically match the
                learner&apos;s assigned grade after secure login.
              </p>
            </div>
          </div>
          <span className="home-game-showcase__count">
            <span>{visibleGames.length}</span>
            {selectedGrade === "All Grades" ? "games available" : `for ${selectedGrade}`}
          </span>
        </div>

        <div className="home-game-showcase__access-note">
          <span className="home-game-showcase__access-icon">
            <LockKeyhole size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Safe preview, protected gameplay</strong>
            <p>Only game information is public. Playing, grade access, scores, XP, levels, and certificates require an authenticated student account.</p>
          </div>
          <Link to="/login">Student login <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>

        {loadingCatalog ? (
          <div className="home-game-grid" aria-label="Loading learning games">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div className="home-game-skeleton" key={item} aria-hidden="true" />
            ))}
          </div>
        ) : visibleGames.length > 0 ? (
          <div className="home-game-grid">
            {visibleGames.map((item) => (
              <HomeGameCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        ) : (
          <div className="home-game-empty">
            <Gamepad2 size={30} aria-hidden="true" />
            <strong>No games are available for {selectedGrade} yet.</strong>
            <p>Select another grade level while your teachers prepare new activities.</p>
          </div>
        )}
      </section>

      <section id="featured-lessons" className="home-section-v2" aria-labelledby="featured-content-title">
        <div className="home-section-v2__heading">
          <div>
            <span className="home-section-v2__icon home-section-v2__icon--yellow">
              <Sparkles size={19} aria-hidden="true" />
            </span>
            <div>
              <span className="home-section-v2__eyebrow">Teacher-published content</span>
              <h2 id="featured-content-title">Featured Lessons</h2>
            </div>
          </div>

          <Link to="/library" className="home-section-v2__view-all">
            Browse lessons <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>

        {loadingCatalog ? (
          <div className="home-feature-grid" aria-label="Loading featured content">
            {[0, 1, 2, 3].map((item) => (
              <div className="home-feature-skeleton" key={item} aria-hidden="true" />
            ))}
          </div>
        ) : featuredLessons.length > 0 ? (
          <div className="home-feature-grid">
            {featuredLessons.map((item) => (
              <FeaturedLearningCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        ) : (
          <div className="home-empty-featured">
            <BookOpen size={30} aria-hidden="true" />
            <strong>No published lessons for {selectedGrade} yet.</strong>
            <p>Choose another grade level or browse the complete learning library.</p>
            <Link to="/library">Open the learning library</Link>
          </div>
        )}
      </section>

      <section className="home-stat-grid" aria-label="Learning hub overview">
        {statistics.map(({ icon: Icon, value, label, tone }) => (
          <article className={`home-stat-card home-stat-card--${tone}`} key={label}>
            <span className="home-stat-card__icon">
              <Icon size={25} aria-hidden="true" />
            </span>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </article>
        ))}
      </section>

      <section id="about-us" className="home-section-v2 home-benefits" aria-labelledby="benefits-title">
        <div className="home-section-v2__heading home-section-v2__heading--simple">
          <div>
            <span className="home-section-v2__icon home-section-v2__icon--pink">
              <Heart size={19} fill="currentColor" aria-hidden="true" />
            </span>
            <div>
              <span className="home-section-v2__eyebrow">Designed for elementary learners</span>
              <h2 id="benefits-title">Why Learners Love Jidanao Learning Hub</h2>
            </div>
          </div>
        </div>

        <div className="home-benefit-grid">
          {BENEFITS.map(({ icon: Icon, title, text, tone }) => (
            <article className="home-benefit-card" key={title}>
              <span className={`home-benefit-card__icon home-benefit-card__icon--${tone}`}>
                <Icon size={22} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="home-process" aria-labelledby="how-it-works-title">
        <div className="home-process__intro">
          <span className="home-section-v2__eyebrow">Simple, guided, and measurable</span>
          <h2 id="how-it-works-title">How the Learning Hub Works</h2>
          <p>
            Every learner follows a clear path from discovery to practice and
            progress, while teachers remain in control of published content.
          </p>
        </div>

        <div className="home-process__steps">
          {HOW_IT_WORKS.map(({ icon: Icon, step, title, text }) => (
            <article className="home-process-card" key={step}>
              <span className="home-process-card__number">{step}</span>
              <span className="home-process-card__icon">
                <Icon size={25} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="help-center" className="home-help-panel" aria-labelledby="help-title">
        <div className="home-help-panel__icon">
          <CircleHelp size={29} aria-hidden="true" />
        </div>
        <div>
          <span className="home-section-v2__eyebrow">Support for our school community</span>
          <h2 id="help-title">Need help accessing your learning account?</h2>
          <p>
            Students may ask their adviser or school administrator for account
            assistance. New students can create an account through the registration page.
          </p>
        </div>
        <div className="home-help-panel__actions">
          <Link to="/login">Go to Login</Link>
          <Link to="/register">Register as Student</Link>
        </div>
      </section>
    </div>
  );
}
