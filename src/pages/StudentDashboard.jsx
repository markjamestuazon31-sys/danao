import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpenCheck,
  Flame,
  FileQuestion,
  Gamepad2,
  LoaderCircle,
  RefreshCw,
  Rocket,
  Sparkles,
  Star,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLearningTile from "../components/student/DashboardLearningTile";
import StudentBadge from "../components/student/StudentBadge";
import StudentHeroMascot from "../components/student/StudentHeroMascot";
import ProfileAvatar from "../components/ProfileAvatar";
import { useAuth } from "../context/AuthContext";
import { deriveBadges, getGradeExperience, subjectTone } from "../data/gradeExperience";
import {
  normalizeProgress,
  subscribePublishedCatalogForGrade,
  subscribeUserProgress,
} from "../services/dataService";
import { subscribePublishedQuizzes } from "../services/assessmentService";
import {
  buildSubjectProgress,
  activityHref,
  continueItem,
  countCompletedActivitiesOnDate,
  formatRelativeTime,
  getRecentActivities,
  learningHref,
  recommendCatalog,
} from "../utils/studentProgress";

function CatalogError({ error }) {
  const needsRules = /permission|denied|publishedCatalog/i.test(String(error || ""));
  return (
    <div className="student-state-card student-state-card--error">
      <RefreshCw size={28} />
      <div>
        <strong>Learning content could not be loaded.</strong>
        <p>
          {needsRules
            ? "Publish the included Realtime Database rules, then use Admin → Learning Content → Sync student catalog."
            : error || "Check the internet connection, then try again."}
        </p>
      </div>
      <button type="button" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}

function StudentMetric({ icon: Icon, label, value, helper, tone }) {
  return (
    <article className={`student-metric student-metric--${tone}`}>
      <span className="student-metric__icon"><Icon size={24} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </article>
  );
}

function PanelHeader({ icon: Icon, title, link, tone = "blue" }) {
  return (
    <div className="student-dashboard-v3__panel-header">
      <div>
        <span className={`student-panel-icon student-panel-icon--${tone}`}><Icon size={18} /></span>
        <h2>{title}</h2>
      </div>
      {link && <Link to={link}>View all</Link>}
    </div>
  );
}

function focusTone(focus) {
  const value = String(focus || "").toLowerCase();
  if (/addition|subtraction|multiplication|fraction|decimal|ratio|problem|operation/.test(value)) return "math";
  if (/science|cycle|reasoning/.test(value)) return "science";
  if (/read|vocab|paragraph|context|word/.test(value)) return "english";
  return "general";
}

function skillPercent(focus, subjectProgress) {
  const tone = focusTone(focus);
  const row = subjectProgress.find((item) => subjectTone(item.subject) === tone);
  return row?.percent || 0;
}

function activityLabel(activity) {
  if (activity.eventType === "lesson_completed") return `Completed lesson: ${activity.title}`;
  if (activity.eventType === "game_completed") return `Played ${activity.title}`;
  if (activity.eventType === "lesson_quiz") return `Quiz attempt: ${activity.title}`;
  if (activity.eventType === "standalone_quiz") return `Submitted quiz: ${activity.title}`;
  return activity.title;
}

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [progress, setProgress] = useState(() => normalizeProgress({}));
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [progressError, setProgressError] = useState("");
  const [assignedQuizzes, setAssignedQuizzes] = useState([]);
  const gradeExperience = getGradeExperience(profile?.gradeLevel);

  useEffect(() => {
    if (!profile?.gradeLevel) return undefined;
    setCatalogLoading(true);
    setCatalogError("");
    return subscribePublishedCatalogForGrade(
      profile.gradeLevel,
      (items) => {
        setCatalog(items);
        setCatalogLoading(false);
      },
      (error) => {
        console.error("Unable to subscribe to the grade catalog:", error);
        setCatalogError(error.message || "Unable to load learning content.");
        setCatalogLoading(false);
      },
      profile.section,
      profile.classKey,
    );
  }, [profile?.gradeLevel, profile?.section, profile?.classKey]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    setProgressError("");
    return subscribeUserProgress(
      user.uid,
      setProgress,
      (error) => {
        console.error("Unable to subscribe to student progress:", error);
        setProgressError(error.message || "Progress could not be loaded.");
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!profile?.classKey) return undefined;
    return subscribePublishedQuizzes(profile.classKey, setAssignedQuizzes, (error) => {
      console.warn("Unable to load assigned quizzes:", error);
    });
  }, [profile?.classKey]);

  const summary = progress.summary;
  const recommendedLessons = useMemo(() => recommendCatalog(catalog, progress, "lesson", 3), [catalog, progress]);
  const recommendedGames = useMemo(() => recommendCatalog(catalog, progress, "game", 2), [catalog, progress]);
  const nextActivity = useMemo(() => continueItem(catalog, progress), [catalog, progress]);
  const badges = useMemo(() => deriveBadges(summary), [summary]);
  const unlockedBadges = badges.filter((badge) => badge.unlocked);
  const subjectProgress = useMemo(() => buildSubjectProgress(catalog, progress), [catalog, progress]);
  const recentActivities = useMemo(() => getRecentActivities(progress).slice(0, 4), [progress]);
  const completedToday = useMemo(() => countCompletedActivitiesOnDate(progress), [progress]);
  const dailyGoalPercent = Math.min(100, Math.round((completedToday / gradeExperience.dailyGoal) * 100));
  const firstName = String(profile?.name || "Learner").trim().split(/\s+/)[0];
  const featuredSubjects = subjectProgress.slice(0, 3);

  return (
    <div className={`student-portal student-dashboard-v3 student-theme--${gradeExperience.theme}`}>
      <section className="student-welcome-hero student-welcome-hero--v3">
        <div className="student-welcome-hero__copy">
          <div className="student-welcome-hero__identity">
            <ProfileAvatar uid={user?.uid} name={profile?.name} size={46} decorative />
            <span className="student-welcome-hero__hello">Welcome back, {firstName}! <span aria-hidden="true">👋</span></span>
          </div>
          <h1>Ready to learn, {firstName}?</h1>
          <p>Every lesson brings you closer to your goals. Let’s make today amazing!</p>
          <div className="student-welcome-hero__actions">
            <Link className="student-hero-primary" to={nextActivity ? learningHref(nextActivity) : "/student/lessons"}>
              <BookOpenCheck size={18} /> {nextActivity ? "Continue Learning" : "Explore Lessons"}
            </Link>
            <Link className="student-hero-secondary" to="/student/games">
              <Gamepad2 size={18} /> Play Learning Game
            </Link>
          </div>
        </div>

        <StudentHeroMascot />

        <div className="student-level-card student-level-card--v3">
          <div className="student-level-card__title">
            <span className="student-level-card__medal"><Star size={30} fill="currentColor" /></span>
            <div>
              <small>YOUR LEARNING LEVEL</small>
              <strong>{gradeExperience.title}</strong>
              <span className="student-level-card__level-pill">Level {summary.level}</span>
            </div>
          </div>
          <div className="student-level-card__progress">
            <div><span>Progress to next level</span><b>{summary.currentLevelXp} / {summary.requiredXp} XP</b></div>
            <div className="student-level-card__track"><span style={{ width: `${summary.levelPercent}%` }} /></div>
          </div>
          <div className="student-level-card__streak">
            <Flame size={18} />
            <strong>{summary.currentStreak} day streak</strong>
            <span>Best: {summary.longestStreak} days</span>
          </div>
        </div>
      </section>

      {progressError && <div className="student-inline-warning">{progressError}</div>}
      {catalogError && <CatalogError error={catalogError} />}

      <section className="student-metrics-grid" aria-label="Learning overview">
        <StudentMetric icon={BookOpenCheck} label="Lessons Completed" value={summary.lessonsCompleted} helper="Awesome work! 🎉" tone="blue" />
        <StudentMetric icon={Gamepad2} label="Games Played" value={summary.gameSessions} helper="Keep it up! ✨" tone="green" />
        <StudentMetric icon={Target} label="Answer Accuracy" value={`${summary.accuracyPercent}%`} helper="Great job! 👍" tone="orange" />
        <StudentMetric icon={Award} label="Badges Earned" value={unlockedBadges.length} helper="You’re a star! ⭐" tone="violet" />
      </section>

      <section className="student-dashboard-v3__triptych">
        <article className="student-dashboard-panel student-dashboard-v3__mission">
          <PanelHeader icon={Target} title="Today’s Mission" tone="blue" />
          <div className="student-dashboard-v3__mission-content">
            <div className="student-daily-goal__ring" style={{ background: `conic-gradient(#f59e0b ${dailyGoalPercent * 3.6}deg, #edf1f7 0)` }}>
              <span>{completedToday}/{gradeExperience.dailyGoal}</span>
            </div>
            <div>
              <strong>Complete {gradeExperience.dailyGoal} activities</strong>
              <p>{dailyGoalPercent >= 100 ? "Mission complete! Amazing work today." : `You’re doing great! Finish ${Math.max(0, gradeExperience.dailyGoal - completedToday)} more to complete today’s mission.`}</p>
              <span className="student-dashboard-v3__mission-reward"><Star size={13} fill="currentColor" /> Completed activities grow your XP</span>
            </div>
          </div>
        </article>

        <article className="student-dashboard-panel student-dashboard-v3__recommendations">
          <PanelHeader icon={BookOpenCheck} title="Recommended Lessons" link="/student/lessons" />
          {catalogLoading ? (
            <div className="student-dashboard-v3__loading"><LoaderCircle className="spin" size={26} /> Loading lessons…</div>
          ) : recommendedLessons.length ? (
            <div className="student-dashboard-v3__lesson-row">
              {recommendedLessons.map((item) => <DashboardLearningTile key={item.id} item={item} progress={progress} />)}
            </div>
          ) : <p className="student-panel-empty">Teacher-approved lessons will appear here.</p>}
        </article>

        <article className="student-dashboard-panel student-dashboard-v3__games">
          <PanelHeader icon={Gamepad2} title="Recommended Games" link="/student/games" tone="orange" />
          {catalogLoading ? (
            <div className="student-dashboard-v3__loading"><LoaderCircle className="spin" size={26} /> Loading games…</div>
          ) : recommendedGames.length ? (
            <div className="student-dashboard-v3__game-row">
              {recommendedGames.map((item) => <DashboardLearningTile key={item.id} item={item} progress={progress} game />)}
            </div>
          ) : <p className="student-panel-empty">Learning games will appear here when published.</p>}
        </article>
      </section>

      {!catalogLoading && !catalogError && catalog.length === 0 && (
        <div className="student-state-card student-state-card--empty">
          <Sparkles size={30} />
          <div><strong>Your grade catalog is ready for content.</strong><p>An administrator must publish {profile?.gradeLevel} content and sync the student catalog.</p></div>
        </div>
      )}

      <section className="student-dashboard-v3__triptych student-dashboard-v3__triptych--secondary">
        <article className="student-dashboard-panel">
          <PanelHeader icon={Sparkles} title="Skills to Build" tone="violet" />
          <div className="student-dashboard-v3__skills-grid">
            {gradeExperience.focus.slice(0, 4).map((focus) => {
              const percent = skillPercent(focus, subjectProgress);
              return (
                <div className={`student-dashboard-v3__skill is-${focusTone(focus)}`} key={focus}>
                  <div><strong>{focus}</strong><b>{percent}%</b></div>
                  <span><i style={{ width: `${percent}%` }} /></span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="student-dashboard-panel">
          <PanelHeader icon={BarChart3} title="Subject Progress" link="/student/progress" />
          {featuredSubjects.length ? (
            <div className="student-dashboard-v3__subject-rings">
              {featuredSubjects.map((row) => (
                <div key={row.subject} className={`student-dashboard-v3__subject-ring is-${subjectTone(row.subject)}`}>
                  <div className="student-dashboard-v3__ring" style={{ "--subject-percent": row.percent }}><span>{row.percent}%</span></div>
                  <strong>{row.subject}</strong>
                  <small>{row.percent >= 75 ? "Good progress" : row.percent ? "Keep practicing" : "Ready to start"}</small>
                </div>
              ))}
            </div>
          ) : <p className="student-panel-empty">Start a lesson or game to see subject progress.</p>}
        </article>

        <article className="student-dashboard-panel">
          <PanelHeader icon={Award} title="Latest Badges" link="/student/achievements" tone="orange" />
          <div className="student-badge-grid student-badge-grid--compact student-badge-grid--dashboard">
            {badges.slice(0, 4).map((badge) => <StudentBadge key={badge.id} badge={badge} compact />)}
          </div>
        </article>
      </section>

      <section className="student-dashboard-v3__bottom-row">
        <article className="student-dashboard-panel student-assigned-quiz-panel">
          <PanelHeader icon={FileQuestion} title="Teacher Quizzes" link="/student/quizzes" tone="violet" />
          {assignedQuizzes.length ? (
            <div className="student-assigned-quiz-list">
              {assignedQuizzes.slice(0, 3).map((quiz) => (
                <Link key={quiz.id} to={`/student/quizzes/${quiz.id}`}>
                  <span><FileQuestion size={18} /></span>
                  <div><strong>{quiz.title}</strong><small>{quiz.subject} · {quiz.gradingPeriod}</small></div>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </div>
          ) : <p className="student-panel-empty">Your teacher’s Grade + Section quizzes will appear here.</p>}
        </article>

        <article className="student-dashboard-panel student-recent-panel">
          <PanelHeader icon={Sparkles} title="Recent Learning Activity" />
          {recentActivities.length ? (
            <div className="student-recent-list student-recent-list--v3">
              {recentActivities.map((activity) => (
                <Link key={activity.eventId || `${activity.type}-${activity.id}-${activity.timestamp}`} to={activityHref(activity)}>
                  <span className={`student-recent-list__icon is-${activity.type}`}>
                    {activity.type === "game" ? <Gamepad2 size={18} /> : activity.type === "quiz" ? <FileQuestion size={18} /> : <BookOpenCheck size={18} />}
                  </span>
                  <div><strong>{activityLabel(activity)}</strong><span>{activity.score ? (activity.type === "game" ? `Score ${activity.score}` : `Scored ${activity.score}%`) : activity.subject}</span></div>
                  <time>{formatRelativeTime(activity.timestamp)}</time>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </div>
          ) : <p className="student-panel-empty">Your completed lessons and games will appear here.</p>}
        </article>

        <article className="student-dashboard-v3__motivation">
          <div className="student-dashboard-v3__rocket"><Rocket size={62} /></div>
          <div>
            <h2>Keep going, {firstName}!</h2>
            <p>You’re on a roll! Consistency today leads to success tomorrow.</p>
            <Link to="/student/progress"><BarChart3 size={16} /> Show My Progress</Link>
          </div>
        </article>
      </section>
    </div>
  );
}
