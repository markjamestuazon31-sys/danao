import { get, ref } from "firebase/database";
import { database } from "../firebase/firebaseConfig";
import { normalizeGradeLevel } from "../data/gradeExperience";
import { classLabel, contentMatchesStudentClass } from "../data/schoolClasses";

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
    let snapshot = await get(ref(database, `${node}/${contentId}`));
    let contentValue = null;

    if (snapshot.exists()) {
      contentValue = snapshot.val();
    } else {
      // Compatibility path for content that was published to the catalog first.
      const catalog = await get(ref(database, `publishedCatalog`));
      if (catalog.exists()) {
        for (const gradeNode of Object.values(catalog.val())) {
          const collection = gradeNode?.[node] || {};
          if (collection[contentId]) {
            contentValue = collection[contentId];
            break;
          }
        }
      }
    }

    if (!contentValue) {
      throw new LearningAccessError("Learning content could not be loaded.", "not-found");
    }
    const content = { id: contentId, type, ...contentValue };

    // Realtime Database Rules enforce the same checks at the data boundary.
    // This client check provides a child-friendly error instead of a raw SDK error.
    if (profile.role === "student") {
      const learnerGrade = normalizeGradeLevel(profile.gradeLevel);
      if (content.status !== "published" || !contentMatchesStudentClass(content, profile)) {
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
