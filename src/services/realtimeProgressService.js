import { get, push, ref, runTransaction, update } from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";
import { getGradeExperience, normalizeGradeLevel } from "../data/gradeExperience";
import { normalizeLesson } from "../utils/lessonContent";
import { isOriginalDocumentLesson } from "../utils/originalLessonMaterial";
import { isContentAvailable } from "../utils/contentPublication";
import { contentMatchesStudentClass } from "../data/schoolClasses";

const LESSON_STEPS = Object.freeze({
  overview: 10,
  learn: 30,
  examples: 50,
  practice: 70,
  quiz: 90,
  challenge: 99,
});
const MAX_ACTIVITY_EVENTS = 80;

function number(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clean(value) {
  return JSON.parse(JSON.stringify(value));
}

function dateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function previousDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() - 1);
  return dateKey(date.getTime());
}

function updateStreak(summary, now) {
  const today = dateKey(now);
  if (summary.lastActiveDate === today) return summary;
  const currentStreak = summary.lastActiveDate === previousDateKey(now)
    ? number(summary.currentStreak) + 1
    : 1;
  return {
    ...summary,
    currentStreak,
    longestStreak: Math.max(number(summary.longestStreak), currentStreak),
    lastActiveDate: today,
  };
}

function activityMap(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, event]) => event && typeof event === "object"));
}

function addActivity(current, eventId, event) {
  return Object.fromEntries(
    Object.entries({ ...activityMap(current), [eventId]: clean(event) })
      .sort(([, a], [, b]) => number(b.timestamp) - number(a.timestamp))
      .slice(0, MAX_ACTIVITY_EVENTS),
  );
}

function subjectMap(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, enabled]) => Boolean(enabled)));
}

function friendlyError(error, fallback) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return new Error("Your account is not allowed to update this learning record.");
  if (code.includes("network")) return new Error("The result could not be saved. Check your connection and try again.");
  return new Error(error?.message || fallback);
}

async function studentContext(type, contentId) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sign in again to save learning progress.");
  const node = type === "game" ? "games" : "lessons";
  const [profileSnapshot, contentSnapshot] = await Promise.all([
    get(ref(database, `users/${currentUser.uid}`)),
    get(ref(database, `${node}/${contentId}`)),
  ]);
  if (!profileSnapshot.exists()) throw new Error("Your learner profile is missing.");
  if (!contentSnapshot.exists()) throw new Error(`${type === "game" ? "Game" : "Lesson"} not found.`);
  const profile = profileSnapshot.val();
  const grade = normalizeGradeLevel(profile.gradeLevel);
  const content = { id: contentId, type, ...contentSnapshot.val() };
  const contentGrade = normalizeGradeLevel(content.grade || content.gradeLevel);
  if (profile.role !== "student" || profile.status !== "active") throw new Error("An active student account is required.");
  if (!isContentAvailable(content) || !contentMatchesStudentClass(content, profile)) {
    throw new Error(`This ${type} is not assigned to your ${grade} profile.`);
  }
  return { uid: currentUser.uid, profile: { ...profile, gradeLevel: grade }, content: { ...content, grade: contentGrade } };
}

function nextEventId(uid) {
  return push(ref(database, `progress/${uid}/activity`)).key || `event-${Date.now()}`;
}

export async function saveLessonCheckpoint(lessonId, step) {
  const normalizedStep = String(step || "overview").toLowerCase();
  if (!Object.hasOwn(LESSON_STEPS, normalizedStep)) throw new Error("That lesson step is invalid.");
  try {
    const { uid, profile, content: lesson } = await studentContext("lesson", lessonId);
    const now = Date.now();
    const eventId = nextEventId(uid);
    const result = await runTransaction(ref(database, `progress/${uid}`), (value) => {
      const root = value || {};
      const existing = root.lesson?.[lessonId] || {};
      const firstStart = !existing.startedAt;
      const summary = updateStreak(root.summary || {}, now);
      return {
        ...root,
        lesson: {
          ...(root.lesson || {}),
          [lessonId]: {
            ...existing,
            title: lesson.title || "Learning lesson",
            subject: lesson.subject || "General",
            grade: profile.gradeLevel,
            startedAt: existing.startedAt || now,
            percent: existing.completed ? 100 : Math.min(99, Math.max(number(existing.percent), LESSON_STEPS[normalizedStep])),
            currentStep: normalizedStep,
            updatedAt: now,
          },
        },
        activity: firstStart
          ? addActivity(root.activity, eventId, {
              eventType: "lesson_started",
              contentType: "lesson",
              contentId: lessonId,
              title: lesson.title || "Learning lesson",
              subject: lesson.subject || "General",
              grade: profile.gradeLevel,
              status: "Started lesson",
              timestamp: now,
            })
          : activityMap(root.activity),
        summary: {
          ...summary,
          subjects: { ...subjectMap(summary.subjects), [lesson.subject || "General"]: true },
          updatedAt: now,
        },
      };
    });
    if (!result.committed) throw new Error("Lesson progress was not saved.");
    return { lessonId, step: normalizedStep, percent: LESSON_STEPS[normalizedStep], updatedAt: now };
  } catch (error) {
    throw friendlyError(error, "Lesson progress could not be saved.");
  }
}

/** Original-document lessons do not require invented practice/reflection steps.
 * A teacher-authored quiz/game remains a separate, explicit completion condition.
 * Rules must independently protect progress and class access on the server.
 */
export async function recordDocumentReading(lessonId) {
  try {
    const { uid, profile, content: lesson } = await studentContext("lesson", lessonId);
    if (!isOriginalDocumentLesson(lesson)) throw new Error("This is not a document lesson.");
    const hasQuiz = normalizeLesson(lesson).quizQuestions.length > 0;
    const linkedGameId = lesson.gameId || lesson.connectedGameId;
    const now = Date.now(); const eventId = nextEventId(uid);
    const reward = getGradeExperience(profile.gradeLevel).lessonXp;
    let awardedXp = 0; let complete = false;
    const transaction = await runTransaction(ref(database, `progress/${uid}`), (value) => {
      const root = value || {}; const existing = root.lesson?.[lessonId] || {};
      awardedXp = 0;
      const assessmentDone = hasQuiz
        ? Math.max(number(existing.bestQuizScore), number(existing.lastQuizScore)) >= 70
        : linkedGameId ? Boolean(root.game?.[linkedGameId]?.completedAt) : true;
      complete = Boolean(existing.completed || assessmentDone);
      const firstCompletion = complete && !existing.completed;
      const firstRead = !existing.readingCompletedAt;
      if (!firstCompletion && !firstRead) return root;
      awardedXp = firstCompletion ? reward : 0;
      const summary = updateStreak(root.summary || {}, now);
      return {
        ...root,
        lesson: { ...(root.lesson || {}), [lessonId]: {
          ...existing, title: lesson.title || "Lesson document", subject: lesson.subject || "General", grade: profile.gradeLevel,
          startedAt: existing.startedAt || now, readingCompletedAt: existing.readingCompletedAt || now,
          percent: complete ? 100 : Math.max(number(existing.percent), 70),
          currentStep: complete ? "challenge" : "learn", updatedAt: now,
          ...(complete ? { completed: true, completedAt: existing.completedAt || now, xpEarned: number(existing.xpEarned) + awardedXp } : {}),
        } },
        activity: addActivity(root.activity, eventId, {
          eventType: firstCompletion ? "lesson_completed" : "lesson_read", contentType: "lesson", contentId: lessonId,
          title: lesson.title || "Lesson document", subject: lesson.subject || "General", grade: profile.gradeLevel,
          status: firstCompletion ? "Lesson completed" : "Original lesson read", xpEarned: awardedXp, timestamp: now,
        }),
        summary: { ...summary, totalXp: number(summary.totalXp) + awardedXp,
          lessonsCompleted: number(summary.lessonsCompleted) + (firstCompletion ? 1 : 0),
          subjects: { ...subjectMap(summary.subjects), [lesson.subject || "General"]: true }, updatedAt: now },
      };
    });
    if (!transaction.committed) throw new Error("Your reading progress was not saved. Please try again.");
    return { lessonId, read: true, completed: complete, xpAwarded: awardedXp };
  } catch (error) { throw friendlyError(error, "Your reading progress could not be saved."); }
}

export async function recordLessonQuizAttempt(lessonId, answers) {
  try {
    const { uid, profile, content } = await studentContext("lesson", lessonId);
    const lesson = normalizeLesson(content);
    const questions = lesson.quizQuestions;
    const answered = questions.filter((item) => answers?.[item.id] !== undefined).length;
    if (!questions.length || answered < questions.length) {
      throw new Error(`Answer every quiz question before submitting (${answered}/${questions.length}).`);
    }
    const feedback = questions.map((item) => ({
      id: item.id,
      correct: String(answers[item.id]).trim().toLowerCase() === String(item.answer).trim().toLowerCase(),
      explanation: item.explanation,
    }));
    const correct = feedback.filter((item) => item.correct).length;
    const score = Math.round((correct / questions.length) * 100);
    const now = Date.now();
    const attemptId = nextEventId(uid);
    const result = await runTransaction(ref(database, `progress/${uid}`), (value) => {
      const root = value || {};
      const existing = root.lesson?.[lessonId] || {};
      const summary = updateStreak(root.summary || {}, now);
      return {
        ...root,
        lesson: {
          ...(root.lesson || {}),
          [lessonId]: {
            ...existing,
            title: lesson.title,
            subject: lesson.subject || "General",
            grade: profile.gradeLevel,
            startedAt: existing.startedAt || now,
            percent: Math.max(number(existing.percent), 90),
            currentStep: "quiz",
            quizAttempts: number(existing.quizAttempts) + 1,
            lastQuizScore: score,
            bestQuizScore: Math.max(number(existing.bestQuizScore), score),
            correctAnswers: number(existing.correctAnswers) + correct,
            totalQuestions: number(existing.totalQuestions) + questions.length,
            lastQuizAttemptAt: now,
            updatedAt: now,
          },
        },
        activity: addActivity(root.activity, attemptId, {
          eventType: "lesson_quiz",
          contentType: "lesson",
          contentId: lessonId,
          title: lesson.title,
          subject: lesson.subject || "General",
          grade: profile.gradeLevel,
          status: `Quiz ${score}%`,
          score,
          correctAnswers: correct,
          totalQuestions: questions.length,
          timestamp: now,
        }),
        summary: {
          ...summary,
          totalCorrectAnswers: number(summary.totalCorrectAnswers) + correct,
          totalQuestions: number(summary.totalQuestions) + questions.length,
          bestQuizScore: Math.max(number(summary.bestQuizScore), score),
          subjects: { ...subjectMap(summary.subjects), [lesson.subject || "General"]: true },
          updatedAt: now,
        },
      };
    });
    if (!result.committed) throw new Error("Quiz attempt was not saved.");
    return { attemptId, score, correct, total: questions.length, passed: score >= 70, feedback, saved: true };
  } catch (error) {
    throw friendlyError(error, "Quiz attempt could not be checked and saved.");
  }
}

export async function completeLessonActivity(lessonId, reflection) {
  const cleanReflection = String(reflection || "").trim().slice(0, 2000);
  if (cleanReflection.length < 12) throw new Error("Write a short learning reflection before completing the lesson.");
  try {
    const { uid, profile, content: lesson } = await studentContext("lesson", lessonId);
    const now = Date.now();
    const eventId = nextEventId(uid);
    const reward = getGradeExperience(profile.gradeLevel).lessonXp;
    let awardedXp = 0;
    let quizScore = 0;
    const result = await runTransaction(ref(database, `progress/${uid}`), (value) => {
      const root = value || {};
      const existing = root.lesson?.[lessonId] || {};
      quizScore = Math.max(number(existing.lastQuizScore), number(existing.bestQuizScore));
      if (quizScore < 70) return;
      if (existing.completed) {
        awardedXp = 0;
        return root;
      }
      awardedXp = reward;
      const summary = updateStreak(root.summary || {}, now);
      return {
        ...root,
        lesson: {
          ...(root.lesson || {}),
          [lessonId]: {
            ...existing,
            title: lesson.title || "Learning lesson",
            subject: lesson.subject || "General",
            grade: profile.gradeLevel,
            completed: true,
            completedAt: now,
            percent: 100,
            currentStep: "challenge",
            reflection: cleanReflection,
            reflectionUpdatedAt: now,
            xpEarned: reward,
            updatedAt: now,
          },
        },
        activity: addActivity(root.activity, eventId, {
          eventType: "lesson_completed",
          contentType: "lesson",
          contentId: lessonId,
          title: lesson.title || "Learning lesson",
          subject: lesson.subject || "General",
          grade: profile.gradeLevel,
          status: "Lesson completed",
          score: quizScore,
          xpEarned: reward,
          timestamp: now,
        }),
        summary: {
          ...summary,
          totalXp: number(summary.totalXp) + reward,
          lessonsCompleted: number(summary.lessonsCompleted) + 1,
          subjects: { ...subjectMap(summary.subjects), [lesson.subject || "General"]: true },
          updatedAt: now,
        },
      };
    });
    if (!result.committed) {
      if (quizScore < 70) throw new Error("Pass the mastery quiz with at least 70% before completing this lesson.");
      throw new Error("Lesson completion was not saved.");
    }
    await update(ref(database), {
      [`reflections/${uid}/${lessonId}`]: {
        lessonId,
        studentUid: uid,
        reflection: cleanReflection,
        submittedAt: now,
      },
    });
    return { lessonId, completed: true, quizScore, xpAwarded: awardedXp, completedAt: now };
  } catch (error) {
    throw friendlyError(error, "Lesson completion could not be saved.");
  }
}

function starsFor(score, maximumScore) {
  const percent = maximumScore > 0 ? (score / maximumScore) * 100 : 0;
  if (percent >= 85) return 3;
  if (percent >= 60) return 2;
  if (percent >= 30) return 1;
  return 0;
}

async function saveGameResult({ uid, profile, game, result }) {
  const total = Math.max(1, Math.min(20, Math.round(number(result.totalQuestions, 10))));
  const correct = Math.max(0, Math.min(total, Math.round(number(result.correctAnswers))));
  const score = Math.max(0, Math.min(total * 250, Math.round(number(result.score))));
  const leveledGame = Boolean(game.builtIn && number(game.totalLevels) === 10);
  const level = leveledGame ? Math.max(1, Math.min(10, Math.round(number(result.level, 1)))) : 1;
  const difficulty = Math.max(1, Math.min(3, Math.round(number(result.difficulty, Math.ceil(level / 4)))));
  const supportedModes = new Set(["classic", "camera", "camera-hand", "camera-dwell", "camera-drag", "camera-reading"]);
  const mode = supportedModes.has(result.mode) ? result.mode : "classic";
  const weekKey = /^\d{4}-\d{2}-\d{2}$/.test(String(result.weekKey || "")) ? String(result.weekKey) : "";
  const weeklyMissionCompleted = Boolean(game.weeklyMission && weekKey && total >= 10);
  const stars = starsFor(score, total * 150);
  const passed = leveledGame ? correct / total >= 0.7 : true;
  const now = Date.now();
  const eventId = nextEventId(uid);
  let awardedXp = 0;
  let levelAllowed = true;
  let maxUnlockedLevel = 1;
  let certificateEligible = false;
  const baseReward = getGradeExperience(profile.gradeLevel).gameXp + stars * 15 + Math.min(50, level * 5);
  const transaction = await runTransaction(ref(database, `progress/${uid}`), (value) => {
    const root = value || {};
    const existing = root.game?.[game.id] || {};
    const existingLevels = existing.levels && typeof existing.levels === "object" ? existing.levels : {};
    const levelKey = `level-${level}`;
    const existingLevel = existingLevels[levelKey] || {};
    const existingWeeklyMissions = existing.weeklyMissions && typeof existing.weeklyMissions === "object" ? existing.weeklyMissions : {};
    const existingWeeklyMission = existingWeeklyMissions[weekKey] || {};
    const previouslyUnlocked = Math.max(1, Math.min(10, number(existing.maxUnlockedLevel, 1)));
    if (leveledGame && level > previouslyUnlocked) {
      levelAllowed = false;
      return;
    }
    const firstCompletion = leveledGame ? passed && !existingLevel.completedAt : !existing.completedAt;
    awardedXp = firstCompletion ? baseReward : 0;
    maxUnlockedLevel = leveledGame && passed
      ? Math.min(10, Math.max(previouslyUnlocked, level + 1))
      : previouslyUnlocked;
    certificateEligible = Boolean(existing.certificateEligible || (leveledGame && passed && level === 10));
    const overallCompletedAt = existing.completedAt || (leveledGame ? certificateEligible ? now : 0 : now);
    const summary = updateStreak(root.summary || {}, now);
    return {
      ...root,
      game: {
        ...(root.game || {}),
        [game.id]: {
          ...existing,
          title: game.title || "Learning game",
          subject: game.subject || "Mathematics",
          grade: profile.gradeLevel,
          playCount: number(existing.playCount) + 1,
          gameSessions: number(existing.gameSessions) + 1,
          score,
          bestScore: Math.max(number(existing.bestScore), score),
          stars,
          bestStars: Math.max(number(existing.bestStars), stars),
          totalCorrect: number(existing.totalCorrect) + correct,
          totalQuestions: number(existing.totalQuestions) + total,
          cameraWins: number(existing.cameraWins) + (result.cameraWin ? 1 : 0),
          xpEarned: number(existing.xpEarned) + awardedXp,
          ...(overallCompletedAt ? { completedAt: overallCompletedAt } : {}),
          ...(weeklyMissionCompleted ? {
            weeklyMissions: {
              ...existingWeeklyMissions,
              [weekKey]: {
                ...existingWeeklyMission,
                weekKey,
                level,
                completed: true,
                completedAt: existingWeeklyMission.completedAt || now,
                attempts: number(existingWeeklyMission.attempts) + 1,
                score,
                bestScore: Math.max(number(existingWeeklyMission.bestScore), score),
                correct,
                bestCorrect: Math.max(number(existingWeeklyMission.bestCorrect), correct),
                total,
                passed,
                updatedAt: now,
              },
            },
          } : {}),
          ...(leveledGame ? {
            levels: {
              ...existingLevels,
              [levelKey]: {
                ...existingLevel,
                level,
                playCount: number(existingLevel.playCount) + 1,
                score,
                bestScore: Math.max(number(existingLevel.bestScore), score),
                stars,
                bestStars: Math.max(number(existingLevel.bestStars), stars),
                correct,
                bestCorrect: Math.max(number(existingLevel.bestCorrect), correct),
                total,
                passed,
                completedAt: existingLevel.completedAt || (passed ? now : 0),
                updatedAt: now,
              },
            },
            currentLevel: level,
            maxUnlockedLevel,
            certificateEligible,
            certificateTrack: game.certificateTrack || "learning",
            ...(certificateEligible ? { certificateEarnedAt: existing.certificateEarnedAt || now } : {}),
          } : {}),
          lastPlayedAt: now,
          lastMode: mode,
          lastDifficulty: difficulty,
          lastLevel: level,
          updatedAt: now,
        },
      },
      activity: addActivity(root.activity, eventId, {
        eventType: "game_completed",
        contentType: "game",
        contentId: game.id,
        title: game.title || "Learning game",
        subject: game.subject || "Mathematics",
        grade: profile.gradeLevel,
        status: leveledGame ? passed ? `Level ${level} completed` : `Level ${level} needs practice` : "Game completed",
        score,
        stars,
        level,
        passed,
        xpEarned: awardedXp,
        cameraWin: Boolean(result.cameraWin),
        mode,
        difficulty,
        ...(weekKey ? { weekKey, weeklyMissionCompleted } : {}),
        timestamp: now,
      }),
      summary: {
        ...summary,
        totalXp: number(summary.totalXp) + awardedXp,
        gameSessions: number(summary.gameSessions) + 1,
        totalGameScore: number(summary.totalGameScore) + score,
        totalCorrectAnswers: number(summary.totalCorrectAnswers) + correct,
        totalQuestions: number(summary.totalQuestions) + total,
        cameraWins: number(summary.cameraWins) + (result.cameraWin ? 1 : 0),
        subjects: { ...subjectMap(summary.subjects), [game.subject || "Mathematics"]: true },
        updatedAt: now,
      },
    };
  });
  if (!transaction.committed) {
    if (!levelAllowed) throw new Error("Complete the previous level before opening this challenge.");
    throw new Error("Game result was not saved.");
  }
  return {
    gameId: game.id,
    score,
    correct,
    total,
    stars,
    passed,
    level,
    nextLevel: passed ? Math.min(10, level + 1) : level,
    maxUnlockedLevel,
    certificateEligible,
    certificateEarnedAt: certificateEligible ? now : 0,
    xpAwarded: awardedXp,
    cameraWin: Boolean(result.cameraWin),
    weekKey,
    weeklyMissionCompleted,
    saved: true,
  };
}

export async function recordGameResult(gameId, result = {}) {
  try {
    const { uid, profile, content: game } = await studentContext("game", gameId);
    return await saveGameResult({ uid, profile, game, result });
  } catch (error) {
    throw friendlyError(error, "Game result could not be saved.");
  }
}

export async function recordSystemGameResult(game, result = {}) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Sign in again to save the game result.");
    const profileSnapshot = await get(ref(database, `users/${currentUser.uid}`));
    if (!profileSnapshot.exists()) throw new Error("Your learner profile is missing.");
    const profile = profileSnapshot.val();
    const gradeLevel = normalizeGradeLevel(profile.gradeLevel);
    if (profile.role !== "student" || profile.status !== "active" || normalizeGradeLevel(game.grade) !== gradeLevel) {
      throw new Error("This game is not assigned to your learner profile.");
    }
    return await saveGameResult({
      uid: currentUser.uid,
      profile: { ...profile, gradeLevel },
      game,
      result,
    });
  } catch (error) {
    throw friendlyError(error, "Camera learning result could not be saved.");
  }
}
