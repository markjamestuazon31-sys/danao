import { get, onValue, ref } from "firebase/database";
import { database } from "../firebase/firebaseConfig";
import { normalizeGradeLevel } from "../data/gradeExperience";
import { classLabel, contentMatchesStudentClass } from "../data/schoolClasses";
import { isContentAvailable } from "../utils/contentPublication";

export class LearningAccessError extends Error {
  constructor(message, code = "unavailable") {
    super(message);
    this.name = "LearningAccessError";
    this.code = code;
  }
}

function normalizeDatabaseError(error, type, profile) {
  const code = String(error?.code || "") || "unavailable";
  const noun = type === "game" ? "game" : "lesson";
  const grade = normalizeGradeLevel(profile?.gradeLevel);

  if (code === "permission-denied") {
    return new LearningAccessError(
      grade
        ? `This ${noun} is not available for your ${grade} learning profile.`
        : `You do not have permission to open this ${noun}.`,
      code,
    );
  }

  if (code === "not-found") {
    return new LearningAccessError(
      `This ${noun} was not found or is no longer available.`,
      code,
    );
  }

  if (code === "failed-precondition") {
    return new LearningAccessError(
      error?.message || "Your learner profile needs attention before this activity can open.",
      code,
    );
  }

  if (code === "unauthenticated") {
    return new LearningAccessError("Sign in again to continue learning.", code);
  }

  return new LearningAccessError(
    error?.message || `Unable to open this ${noun}. Check your connection and try again.`,
    code,
  );
}

export async function getAuthorizedLearningContent({ type, contentId, profile }) {
  if (!contentId) throw new LearningAccessError("Learning content ID is missing.", "invalid-argument");
  if (!profile?.role) throw new LearningAccessError("Your LMS profile is not ready.", "failed-precondition");
  if (!['lesson', 'game'].includes(type)) {
    throw new LearningAccessError("Learning content type is invalid.", "invalid-argument");
  }

  try {
    const node = type === "game" ? "games" : "lessons";
    const snapshot = await get(ref(database, `${node}/${contentId}`));
    const contentValue = snapshot.exists() ? snapshot.val() : null;

    if (!contentValue) {
      throw new LearningAccessError("Learning content could not be loaded.", "not-found");
    }
    const content = { ...contentValue, id: contentId, type };

    // Production Realtime Database Rules must independently enforce access.
    // These client checks provide a readable error; they are not a security boundary.
    if (profile.role === "student") {
      const learnerGrade = normalizeGradeLevel(profile.gradeLevel);
      if (!isContentAvailable(content) || !contentMatchesStudentClass(content, profile)) {
        throw new LearningAccessError(
          `This ${type} is not assigned to your ${classLabel(learnerGrade, profile.section)} learning profile.`,
          "permission-denied",
        );
      }
    }

    return content;
  } catch (error) {
    if (error instanceof LearningAccessError) throw error;
    if (String(error?.code || "").includes("permission-denied")) {
      throw normalizeDatabaseError({ ...error, code: "permission-denied" }, type, profile);
    }
    throw normalizeDatabaseError(error, type, profile);
  }
}

/** Listen to the full, authorized source, including file replacements/unpublishes. */
export function subscribeAuthorizedLearningContent({ type, contentId, profile }, onData, onError) {
  if (!contentId || !["lesson", "game"].includes(type) || !profile?.role) {
    onError?.(new LearningAccessError("Your learning profile or content ID is not ready.", "failed-precondition"));
    return () => {};
  }
  let content = null; let timer = null; let stopped = false;
  function emit() {
    if (stopped) return;
    clearTimeout(timer);
    if (!content) { onError?.(new LearningAccessError("This learning content is no longer available.", "not-found")); return; }
    const now = Date.now();
    const boundaries = [Number(content.publishAt || 0), Number(content.expiresAt || 0)].filter((time) => Number.isFinite(time) && time > now);
    if (boundaries.length) timer = setTimeout(emit, Math.min(2147483647, Math.max(20, Math.min(...boundaries) - now + 20)));
    if (profile.role === "student" && (!isContentAvailable(content, now) || !contentMatchesStudentClass(content, profile))) {
      onError?.(new LearningAccessError("This activity is not currently published for your class.", "permission-denied"));
      return;
    }
    onData(content);
  }
  const node = type === "game" ? "games" : "lessons";
  const stop = onValue(ref(database, `${node}/${contentId}`), (snapshot) => {
    content = snapshot.exists() ? { ...snapshot.val(), id: contentId, type } : null; emit();
  }, (error) => { content = null; clearTimeout(timer); onError?.(normalizeDatabaseError(error, type, profile)); });
  const handleVisibility = () => { if (!document.hidden) emit(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility);
  return () => { stopped = true; clearTimeout(timer); stop(); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility); };
}
