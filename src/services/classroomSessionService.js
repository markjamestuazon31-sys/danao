/**
 * Classroom / Teacher Game Zone session helpers.
 * Ensures each published camera track (truefalse, math, sort, …) is exposed as
 * its own activity so the exact game the teacher published is the one that plays.
 */
import { get, push, ref, set, update } from "firebase/database";
import { database } from "../firebase/firebaseConfig";
import {
  CAMERA_TRACKS,
  cameraProgramQuestions,
  getPublishedCameraProgramsForStudent,
  isCameraProgramActive,
} from "./cameraContentService";
import { classFields } from "../data/schoolClasses";

function text(value, limit = 200) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function classKeyFromTarget(targetClass) {
  if (!targetClass) return "";
  if (targetClass.classKey) return text(targetClass.classKey, 80);
  try {
    return classFields(targetClass.grade, targetClass.section).classKey;
  } catch {
    return "";
  }
}

/**
 * Build the list of published activities for a class.
 * Camera programs are typed as `camera-{track}` with `cameraTrack` set so
 * Teacher Game Zone and the student player always open the correct game.
 */
export async function getClassroomActivities({ teacherId, teacherProfile, targetClass } = {}) {
  const classKey = classKeyFromTarget(targetClass);
  if (!classKey) return [];

  const activities = [];

  // ---- Camera programs (True or False, Math, Reading, Sort, …) ----
  try {
    const snapshot = await get(ref(database, `cameraPublished/${classKey}`));
    if (snapshot.exists()) {
      const now = Date.now();
      Object.entries(snapshot.val()).forEach(([track, levels]) => {
        if (!CAMERA_TRACKS[track]) return;
        const meta = CAMERA_TRACKS[track];
        Object.entries(levels || {}).forEach(([levelKey, record]) => {
          if (!record || record.status !== "published") return;
          if (!isCameraProgramActive(record, now)) return;
          // Optional teacher ownership filter (schoolwide teachers see all)
          if (teacherId && record.teacherId && record.teacherId !== teacherId && teacherProfile?.teachingScope !== "schoolwide") {
            return;
          }
          const level = Number(levelKey.replace(/\D/g, "")) || Number(record.level) || 1;
          const questions = cameraProgramQuestions({
            ...record,
            classKey,
            track,
            level,
          });
          if (!questions.length) return;
          activities.push({
            key: `camera-${track}-level-${level}`,
            type: `camera-${track}`,
            cameraTrack: track,
            cameraKind: meta.kind,
            label: meta.label,
            subject: meta.subject || record.subject || "General",
            title: text(record.title, 120) || `${meta.label} · Level ${level}`,
            level,
            questions,
            grade: record.grade || targetClass?.grade,
            section: record.section || targetClass?.section,
            classKey,
            teacherId: record.teacherId || teacherId || "",
            teacherName: record.teacherName || "",
            publishedAt: record.publishedAt || record.updatedAt || 0,
          });
        });
      });
    }
  } catch (error) {
    console.warn("getClassroomActivities: camera programs failed", error);
  }

  // ---- Published quizzes (if present) ----
  try {
    const quizSnap = await get(ref(database, `publishedQuizzes/${classKey}`));
    if (quizSnap.exists()) {
      Object.entries(quizSnap.val()).forEach(([quizId, quiz]) => {
        if (!quiz || quiz.status !== "published") return;
        const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
        if (!questions.length) return;
        activities.push({
          key: `quiz-${quizId}`,
          type: "quiz",
          label: "Quiz",
          subject: quiz.subject || "Assessment",
          title: text(quiz.title, 120) || "Class Quiz",
          questions: questions.map((q, index) => ({
            id: q.id || `q-${index + 1}`,
            type: q.type || (Array.isArray(q.choices) && q.choices.length ? "choice" : "text"),
            prompt: q.prompt || q.question || "",
            answer: q.answer || q.correctAnswer || "",
            choices: q.choices || [],
            explanation: q.explanation || "",
          })),
          grade: quiz.grade || targetClass?.grade,
          section: quiz.section || targetClass?.section,
          classKey,
          teacherId: quiz.teacherId || teacherId || "",
          publishedAt: quiz.publishedAt || 0,
        });
      });
    }
  } catch (error) {
    console.warn("getClassroomActivities: quizzes failed", error);
  }

  // Newest first
  return activities.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
}

export function evaluateClassroomAnswer(question, answer) {
  if (!question) return { correct: false, correctAnswer: "" };
  const correctAnswer = question.answer ?? question.correctAnswer ?? "";
  const normalizedCorrect = String(correctAnswer).trim().toLowerCase();

  if (answer === "teacher-correct") return { correct: true, correctAnswer };
  if (answer === "teacher-wrong") return { correct: false, correctAnswer };

  // Choice by index
  if (typeof answer === "number" && Array.isArray(question.choices)) {
    const chosen = question.choices[answer];
    const correct = String(chosen || "").trim().toLowerCase() === normalizedCorrect;
    return { correct, correctAnswer, chosen };
  }

  // Choice by text / true-false
  if (typeof answer === "string") {
    const correct = answer.trim().toLowerCase() === normalizedCorrect
      || (Array.isArray(question.acceptedAnswers)
        && question.acceptedAnswers.some((a) => String(a).trim().toLowerCase() === answer.trim().toLowerCase()));
    return { correct, correctAnswer };
  }

  // Multiple select
  if (Array.isArray(answer) && Array.isArray(question.choices)) {
    const chosenTexts = answer.map((i) => String(question.choices[i] || "").trim().toLowerCase()).sort();
    const expected = String(correctAnswer).split(/[,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean).sort();
    const correct = chosenTexts.length === expected.length && chosenTexts.every((v, i) => v === expected[i]);
    return { correct, correctAnswer };
  }

  return { correct: false, correctAnswer };
}

export async function startClassroomSession({ teacherId, learner, activity }) {
  if (!teacherId || !learner || !activity) throw new Error("Teacher, learner, and activity are required to start a session.");
  const sessionRef = push(ref(database, `classroomSessions/${teacherId}`));
  const session = {
    id: sessionRef.key,
    teacherId,
    learnerId: learner.id || learner.uid || "",
    learnerName: text(learner.name || learner.displayName, 100),
    activityKey: activity.key,
    activityType: activity.type,
    cameraTrack: activity.cameraTrack || null,
    contentTitle: activity.title,
    grade: activity.grade || learner.grade || "",
    section: activity.section || learner.section || "",
    classKey: activity.classKey || "",
    totalQuestions: activity.questions?.length || 0,
    responses: [],
    startedAt: Date.now(),
    status: "active",
  };
  await set(sessionRef, session);
  return session;
}

export async function saveClassroomProgress(session, responses) {
  if (!session?.id || !session?.teacherId) return;
  await update(ref(database, `classroomSessions/${session.teacherId}/${session.id}`), {
    responses: responses || [],
    updatedAt: Date.now(),
  });
}

export async function completeClassroomSession(session, responses) {
  if (!session?.id || !session?.teacherId) throw new Error("Session is missing.");
  const list = Array.isArray(responses) ? responses : [];
  const correctCount = list.filter((r) => r.correct).length;
  const total = list.length || session.totalQuestions || 1;
  const accuracyPercent = Math.round((correctCount / total) * 100);
  const summary = {
    ...session,
    responses: list,
    correctCount,
    totalQuestions: total,
    accuracyPercent,
    completedAt: Date.now(),
    status: "completed",
  };
  await update(ref(database, `classroomSessions/${session.teacherId}/${session.id}`), {
    responses: list,
    correctCount,
    totalQuestions: total,
    accuracyPercent,
    completedAt: summary.completedAt,
    status: "completed",
  });
  // Mirror a compact record for the Game Zone history grid
  const recordRef = push(ref(database, `classroomSessionRecords/${session.teacherId}`));
  await set(recordRef, {
    id: recordRef.key,
    sessionId: session.id,
    teacherId: session.teacherId,
    learnerId: session.learnerId,
    learnerName: session.learnerName,
    contentTitle: session.contentTitle,
    activityType: session.activityType,
    cameraTrack: session.cameraTrack || null,
    grade: session.grade,
    section: session.section,
    accuracyPercent,
    correctCount,
    totalQuestions: total,
    startedAt: session.startedAt,
    completedAt: summary.completedAt,
  });
  return summary;
}

export async function getClassroomSessionRecords({ teacherId, targetClass } = {}) {
  if (!teacherId) return [];
  const snapshot = await get(ref(database, `classroomSessionRecords/${teacherId}`));
  if (!snapshot.exists()) return [];
  const classKey = classKeyFromTarget(targetClass);
  return Object.values(snapshot.val())
    .filter((record) => {
      if (!classKey) return true;
      if (record.classKey) return record.classKey === classKey;
      // Fallback match on grade/section labels
      if (targetClass?.grade && record.grade && !String(record.grade).includes(String(targetClass.grade).replace(/^Grade\s*/i, ""))) return false;
      if (targetClass?.section && record.section && !String(record.section).includes(String(targetClass.section).replace(/^Section\s*/i, ""))) return false;
      return true;
    })
    .sort((a, b) => (b.completedAt || b.startedAt || 0) - (a.completedAt || a.startedAt || 0));
}

export async function createSharedDeviceLearner({ teacherId, name, grade, section }) {
  if (!teacherId || !name) throw new Error("Teacher and learner name are required.");
  const learnerRef = push(ref(database, `sharedDeviceLearners/${teacherId}`));
  const learner = {
    id: learnerRef.key,
    name: text(name, 80),
    grade: text(grade, 40),
    section: text(section, 40),
    type: "shared-device",
    createdAt: Date.now(),
  };
  await set(learnerRef, learner);
  return learner;
}
