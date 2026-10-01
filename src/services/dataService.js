import {
  equalTo,
  get,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  update,
} from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";
import { isContentAvailable, normalizePublication } from "../utils/contentPublication";
import {
  gradeToKey,
  levelFromXp,
  normalizeGradeLevel as normalizeGrade,
  systemCatalogForGrade,
} from "../data/gradeExperience";
import {
  ALL_SECTIONS,
  activeAssignedClasses,
  assignedGradeMap,
  classFields,
  contentMatchesStudentClass,
  normalizeAssignedClasses,
  normalizeSection,
  teacherCanAccessClass,
} from "../data/schoolClasses";
import { getActiveClassFields, getSchoolStructure } from "./schoolStructureService";
import { ensureSubjectForGrade } from "../data/curriculum";

const MAX_TEXT_MATERIAL_BYTES = 500 * 1024;
const TEXT_FILE_EXTENSIONS = ["txt", "md", "markdown", "csv", "json"];
const DEFAULT_GRADES = ["Grade 3", "Grade 4", "Grade 5", "Grade 6"];
const CATALOG_FIELDS = [
  "title",
  "description",
  "grade",
  "gradeLevel",
  "subject",
  "difficulty",
  "estimatedMinutes",
  "thumbnail",
  "coverEmoji",
  "competency",
  "questionLimit",
  "section",
  "sectionKey",
  "classKey",
  "gradeKey",
  "teacherId",
  "route",
  "updatedAt",
  "createdAt",
  "publishAt",
  "expiresAt",
  "contentMode",
  "materialName",
];

function toRealtimeData(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSnapshot(snapshot, type) {
  if (!snapshot.exists()) return [];
  return Object.entries(snapshot.val()).map(([id, value]) => ({
    id,
    type,
    ...value,
  }));
}

function isCatalogActive(item) {
  return isContentAvailable(item);
}

function flattenPublishedCatalog(value) {
  if (!value || typeof value !== "object") return [];
  const results = [];
  Object.values(value).forEach((gradeNode) => {
    Object.entries(gradeNode?.lessons || {}).forEach(([id, item]) => {
      results.push({ id, type: "lesson", status: "published", ...item });
    });
    Object.entries(gradeNode?.games || {}).forEach(([id, item]) => {
      results.push({ id, type: "game", status: "published", ...item });
    });
  });
  return results.filter(isCatalogActive);
}

function mergeSystemCatalog(items, gradeLevel) {
  const system = systemCatalogForGrade(gradeLevel);
  const ids = new Set(system.map((item) => `${item.type}:${item.id}`));
  const visibleItems = items.filter((item) => !String(item.id || "").startsWith("camera-reading-filipino-"));
  return [...system, ...visibleItems.filter((item) => !ids.has(`${item.type}:${item.id}`))];
}

function filterCatalogForSection(items, gradeLevel, sectionValue) {
  const section = normalizeSection(sectionValue);
  if (!section) return items;
  return items.filter((item) => item.source === "system" || contentMatchesStudentClass(item, {
    gradeLevel,
    section,
  }));
}

function catalogMetadata(item, type) {
  const targetClass = classFields(
    item.grade || item.gradeLevel,
    normalizeSection(item.section, ALL_SECTIONS),
  );

  const result = {
    ...targetClass,
    id: item.id || null,
    type,
    status: "published",
    grade: normalizeGradeLevel(item.grade || item.gradeLevel),
    gradeLevel: targetClass.grade,
    teacherId: item.teacherId || "",
    publishAt: item.publishAt || null,
    expiresAt: item.expiresAt || null,
    createdAt: item.createdAt || Date.now(),
    updatedAt: item.updatedAt || Date.now(),
  };

  CATALOG_FIELDS.forEach((field) => {
    if (item[field] !== undefined && item[field] !== null && item[field] !== "") {
      result[field] = item[field];
    }
  });

  // Canonical class fields must win over previously stored, possibly stale keys.
  Object.assign(result, targetClass);
  result.materialName = item.material?.name || item.materialName || null;

  return toRealtimeData(result);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSubjectMap(subjects) {
  if (!subjects || typeof subjects !== "object") return {};
  return Object.fromEntries(
    Object.entries(subjects).filter(([, value]) => Boolean(value)),
  );
}

function normalizeActivityMap(activity) {
  if (!activity || typeof activity !== "object") return {};
  return Object.fromEntries(
    Object.entries(activity).filter(([, event]) => event && typeof event === "object"),
  );
}

export function normalizeGradeLevel(value) {
  return normalizeGrade(value);
}

export function normalizeProgress(value = {}) {
  const lesson = value.lesson && typeof value.lesson === "object" ? value.lesson : {};
  const game = value.game && typeof value.game === "object" ? value.game : {};
  const quiz = value.quiz && typeof value.quiz === "object" ? value.quiz : {};
  const activity = normalizeActivityMap(value.activity);
  const stored = value.summary && typeof value.summary === "object" ? value.summary : {};
  const lessonRecords = Object.values(lesson);
  const gameRecords = Object.values(game);
  const quizRecords = Object.values(quiz);
  const derivedSubjects = {};

  lessonRecords.forEach((record) => {
    if (record.subject) derivedSubjects[record.subject] = true;
  });
  gameRecords.forEach((record) => {
    if (record.subject) derivedSubjects[record.subject] = true;
  });
  quizRecords.forEach((record) => {
    if (record.subject) derivedSubjects[record.subject] = true;
  });

  const lessonsCompleted = Math.max(
    safeNumber(stored.lessonsCompleted),
    lessonRecords.filter((record) => record.completed).length,
  );
  const gameSessions = Math.max(
    safeNumber(stored.gameSessions),
    gameRecords.reduce(
      (total, record) => total + safeNumber(record.gameSessions || record.playCount),
      0,
    ),
  );
  const totalCorrectAnswers = Math.max(
    safeNumber(stored.totalCorrectAnswers),
    lessonRecords.reduce((sum, record) => sum + safeNumber(record.correctAnswers), 0) +
      gameRecords.reduce((sum, record) => sum + safeNumber(record.totalCorrect), 0),
  );
  const totalQuestions = Math.max(
    safeNumber(stored.totalQuestions),
    lessonRecords.reduce((sum, record) => sum + safeNumber(record.totalQuestions), 0) +
      gameRecords.reduce((sum, record) => sum + safeNumber(record.totalQuestions), 0),
  );
  const totalGameScore = Math.max(
    safeNumber(stored.totalGameScore),
    gameRecords.reduce((sum, record) => sum + safeNumber(record.bestScore || record.score), 0),
  );
  const bestQuizScore = Math.max(
    safeNumber(stored.bestQuizScore),
    ...lessonRecords.map((record) => safeNumber(record.bestQuizScore || record.quizScore)),
    ...quizRecords.map((record) => safeNumber(record.bestScore || record.latestScore)),
  );
  const cameraWins = Math.max(
    safeNumber(stored.cameraWins),
    gameRecords.reduce((sum, record) => sum + safeNumber(record.cameraWins), 0),
  );
  const totalXp = safeNumber(stored.totalXp);
  const levelData = levelFromXp(totalXp);
  const subjects = {
    ...normalizeSubjectMap(stored.subjects),
    ...derivedSubjects,
  };

  return {
    ...value,
    lesson,
    game,
    quiz,
    activity,
    summary: {
      ...stored,
      ...levelData,
      totalXp,
      lessonsCompleted,
      gameSessions,
      totalCorrectAnswers,
      totalQuestions,
      totalGameScore,
      bestQuizScore,
      cameraWins,
      subjects,
      subjectsExplored: Object.keys(subjects).length,
      activitiesStarted:
        lessonRecords.filter((record) => record.startedAt || record.completed).length +
        gameRecords.filter((record) => record.lastPlayedAt || record.playCount).length +
        quizRecords.filter((record) => record.lastAttemptAt || record.attempts).length,
      accuracyPercent: totalQuestions
        ? Math.round((totalCorrectAnswers / totalQuestions) * 100)
        : 0,
      currentStreak: safeNumber(stored.currentStreak),
      longestStreak: safeNumber(stored.longestStreak),
    },
  };
}

/**
 * Reads metadata only from /publishedCatalog. This deliberately avoids the old
 * orderByChild("status") query that caused the missing-index error.
 */
export async function getPublishedCatalog() {
  const snapshot = await get(ref(database, "publishedCatalog"));
  const remote = snapshot.exists() ? flattenPublishedCatalog(snapshot.val()) : [];
  const grades = [...new Set([
    ...DEFAULT_GRADES,
    ...remote.map((item) => normalizeGradeLevel(item.grade)).filter(Boolean),
  ])];
  return grades.flatMap((grade) => mergeSystemCatalog(
    remote.filter((item) => normalizeGradeLevel(item.grade) === grade),
    grade,
  ));
}

export async function getPublishedCatalogForGrade(gradeLevel, section = "") {
  const key = gradeToKey(gradeLevel);
  const snapshot = await get(ref(database, `publishedCatalog/${key}`));
  const remote = snapshot.exists() ? flattenPublishedCatalog({ [key]: snapshot.val() }) : [];
  return filterCatalogForSection(mergeSystemCatalog(remote, gradeLevel), gradeLevel, section);
}

export function subscribePublishedCatalogForGrade(gradeLevel, onData, onError, section = "") {
  const key = gradeToKey(gradeLevel);
  let raw = null;
  let timer = null;
  let stopped = false;
  function emit() {
    if (stopped) return;
    clearTimeout(timer);
    const items = raw ? flattenPublishedCatalog({ [key]: raw }) : [];
    onData(filterCatalogForSection(mergeSystemCatalog(items, gradeLevel), gradeLevel, section));
    const now = Date.now();
    const boundaries = [...Object.values(raw?.lessons || {}), ...Object.values(raw?.games || {})]
      .flatMap((item) => [Number(item.publishAt || 0), Number(item.expiresAt || 0)])
      .filter((time) => Number.isFinite(time) && time > now);
    if (boundaries.length) timer = setTimeout(emit, Math.min(2147483647, Math.max(20, Math.min(...boundaries) - now + 20)));
  }
  const unsubscribe = onValue(ref(database, `publishedCatalog/${key}`), (snapshot) => {
    raw = snapshot.exists() ? snapshot.val() : null;
    emit();
  }, (error) => { raw = null; emit(); onError?.(error); });
  const handleVisibility = () => { if (typeof document === "undefined" || !document.hidden) emit(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility);
  return () => { stopped = true; clearTimeout(timer); unsubscribe();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility);
  };
}

/** Save a single record, or a linked lesson/game pair, in ONE root update. */
export async function saveTeacherContentBatch(teacherId, entries) {
  if (!teacherId || auth.currentUser?.uid !== teacherId) throw new Error("Sign in with your teacher account before saving.");
  if (!Array.isArray(entries) || !entries.length || entries.length > 2) throw new Error("Choose a lesson, a game, or one lesson/game pair.");
  if (new Set(entries.map((entry) => entry.type)).size !== entries.length) throw new Error("Only one item of each type can be saved together.");
  const actorSnapshot = await get(ref(database, `users/${teacherId}`));
  const actor = actorSnapshot.exists() ? actorSnapshot.val() : null;
  if (!["teacher", "admin"].includes(actor?.role) || actor.status !== "active") throw new Error("An active teacher account is required.");
  const now = Date.now();
  const prepared = await Promise.all(entries.map(async ({ type, id, content }) => {
    if (!["lesson", "game"].includes(type)) throw new Error("Invalid learning content type.");
    if (id && /[.#$\[\]\/]/.test(id)) throw new Error("Invalid learning content ID.");
    const node = type === "game" ? "games" : "lessons";
    let current = null;
    if (id) {
      const snapshot = await get(ref(database, `${node}/${id}`));
      if (!snapshot.exists()) throw new Error("This content no longer exists. Refresh your library.");
      current = snapshot.val();
      if (current.teacherId !== teacherId && actor.role !== "admin") throw new Error("Only the creating teacher can change this content.");
    }
    const merged = { ...(current || {}), ...(content || {}) };
    const target = classFields(merged.grade || merged.gradeLevel, normalizeSection(merged.section, ALL_SECTIONS));
    if (!teacherCanAccessClass(actor, target.grade, target.section)) throw new Error("This grade and section is outside your administrator-assigned teaching scope.");
    if (!String(merged.title || "").trim()) throw new Error("Enter a title for this learning activity.");
    if (type === "lesson" && merged.contentMode === "document" && !merged.material?.url) throw new Error("Upload the original lesson file before saving. An extracted-text copy is not an original document.");
    const publicationInput = { ...merged };
    // Metadata-only edits must not accidentally publish a scheduled lesson early.
    if (content?.status === undefined && merged.status === "published" && Number(merged.publishAt) > now) publicationInput.status = "scheduled";
    const record = toRealtimeData({ ...merged, ...target, ...normalizePublication(publicationInput, now),
      subject: ensureSubjectForGrade(target.grade, merged.subject),
      teacherId: current?.teacherId || teacherId, createdAt: current?.createdAt || now, updatedAt: now });
    delete record.id; delete record.type;
    return { id: id || push(ref(database, node)).key, type, node, current, record };
  }));
  const lesson = prepared.find((entry) => entry.type === "lesson");
  const game = prepared.find((entry) => entry.type === "game");
  if (lesson && game) {
    if (lesson.record.classKey !== game.record.classKey) throw new Error("A connected lesson and game must belong to the same class.");
    if (lesson.record.status !== game.record.status || lesson.record.publishAt !== game.record.publishAt || lesson.record.expiresAt !== game.record.expiresAt) throw new Error("Use the same publication schedule for a lesson/game pair.");
    lesson.record.gameId = game.id; lesson.record.connectedGameId = game.id;
    lesson.record.quiz = game.record.questions || null;
    game.record.lessonId = lesson.id;
  }
  const updates = {};
  prepared.forEach(({ id, type, node, current, record }) => {
    updates[`${node}/${id}`] = record;
    if (current) {
      const oldKeys = new Set([current.gradeKey, gradeToKey(current.grade || current.gradeLevel)]);
      oldKeys.forEach((key) => { if (key) updates[`publishedCatalog/${key}/${node}/${id}`] = null; });
    }
    updates[`publishedCatalog/${record.gradeKey}/${node}/${id}`] = record.status === "published"
      ? catalogMetadata({ ...record, id }, type) : null;
  });
  await update(ref(database), updates);
  return prepared.map(({ id, type, record }) => ({ ...record, id, type }));
}

async function saveTeacherContent(type, teacherId, content) {
  const [saved] = await saveTeacherContentBatch(teacherId, [{ type, content }]);
  return saved;
}
export async function saveLesson(teacherId, lesson) { return saveTeacherContent("lesson", teacherId, lesson); }
export async function saveGame(teacherId, game) { return saveTeacherContent("game", teacherId, game); }

export async function deleteTeacherContent(teacherId, type, contentId) {
  if (!teacherId || auth.currentUser?.uid !== teacherId) throw new Error("A signed-in teacher is required.");
  if (!contentId) throw new Error("Learning content ID is required.");
  if (!["lesson", "game"].includes(type)) throw new Error("Invalid learning content type.");

  const node = type === "game" ? "games" : "lessons";
  const plural = type === "game" ? "games" : "lessons";
  const snapshot = await get(ref(database, `${node}/${contentId}`));
  if (!snapshot.exists()) throw new Error("This learning content no longer exists.");

  const record = snapshot.val();
  if (record.teacherId !== teacherId) {
    throw new Error("Only the teacher who created this content can delete it.");
  }

  const gradeKey = record.gradeKey || gradeToKey(record.grade || record.gradeLevel);
  const changes = { [`${node}/${contentId}`]: null };
  for (const key of new Set([gradeKey, gradeToKey(record.grade || record.gradeLevel)])) {
    if (key) changes[`publishedCatalog/${key}/${plural}/${contentId}`] = null;
  }
  await update(ref(database), changes);
  return { id: contentId, type, title: record.title || "Untitled content" };
}

export async function updateLesson(lessonId, changes) {
  return updateTeacherContent("lesson", lessonId, changes);
}

export async function updateGame(gameId, changes) {
  return updateTeacherContent("game", gameId, changes);
}

export async function updateTeacherContent(type, contentId, changes) {
  if (!contentId) throw new Error("Learning content ID is required.");
  const [saved] = await saveTeacherContentBatch(auth.currentUser?.uid, [{ type, id: contentId, content: changes }]);
  return saved;
}

export async function saveQuiz(teacherId, quiz) {
  if (!teacherId) throw new Error("A signed-in teacher is required.");
  const quizRef = push(ref(database, "quizBank"));
  const now = Date.now();
  const record = toRealtimeData({
    ...quiz,
    teacherId,
    createdAt: now,
    updatedAt: now,
  });
  await set(quizRef, record);
  return { id: quizRef.key, ...record };
}

export async function readTextMaterialFile(file) {
  if (!file) return null;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const isTextMime = file.type.startsWith("text/");
  const isAllowedExtension = TEXT_FILE_EXTENSIONS.includes(extension);
  if (!isTextMime && !isAllowedExtension) {
    throw new Error(
      "Only TXT, Markdown, CSV, or JSON files can be imported into Realtime Database. Use an approved external URL for PDF, DOCX, images, audio, or video.",
    );
  }
  if (file.size > MAX_TEXT_MATERIAL_BYTES) {
    throw new Error("The text material must be 500 KB or smaller.");
  }
  const text = await file.text();
  return {
    name: file.name,
    contentType: file.type || "text/plain",
    size: file.size,
    text,
    importedAt: Date.now(),
  };
}

export async function getUserProgress(uid) {
  const snapshot = await get(ref(database, `progress/${uid}`));
  return normalizeProgress(snapshot.exists() ? snapshot.val() : {});
}

export function subscribeUserProgress(uid, onData, onError) {
  return onValue(
    ref(database, `progress/${uid}`),
    (snapshot) => onData(normalizeProgress(snapshot.exists() ? snapshot.val() : {})),
    onError,
  );
}

export function subscribeStudentGrades(uid, onData, onError) {
  return onValue(
    ref(database, `grades/${uid}`),
    (snapshot) => onData(snapshot.exists() ? snapshot.val() : {}),
    onError,
  );
}

export function subscribeStudentCertificates(uid, onData, onError) {
  return onValue(
    ref(database, `certificates/${uid}`),
    (snapshot) => onData(snapshot.exists() ? snapshot.val() : {}),
    onError,
  );
}

export async function getUsers() {
  const snapshot = await get(ref(database, "users"));
  if (!snapshot.exists()) return [];
  return Object.entries(snapshot.val()).map(([uid, value]) => ({ uid, ...value }));
}

function isMissingIndexError(error) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("index not defined")
    || message.includes("indexon")
    || message.includes("index-not-defined");
}

async function getTeacherOwnedRecords(node, type, teacherId) {
  if (!teacherId) throw new Error("A signed-in teacher is required.");

  try {
    const snapshot = await get(
      query(ref(database, node), orderByChild("teacherId"), equalTo(teacherId)),
    );
    return normalizeSnapshot(snapshot, type);
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;

    // Keep the teacher workspace usable when an older deployed ruleset has not
    // received the teacherId index yet. The bundled database rules include the
    // index, so this becomes a temporary compatibility path after deployment.
    console.warn(`The ${node} teacherId index is not deployed yet; using the safe compatibility reader.`);
    const snapshot = await get(ref(database, node));
    return normalizeSnapshot(snapshot, type)
      .filter((item) => item.teacherId === teacherId);
  }
}

export async function getTeacherLessons(teacherId) {
  return getTeacherOwnedRecords("lessons", "lesson", teacherId);
}

export async function getTeacherGames(teacherId) {
  return getTeacherOwnedRecords("games", "game", teacherId);
}

export async function getTeacherQuizzes(teacherId) {
  return getTeacherOwnedRecords("quizBank", "quiz", teacherId);
}

export async function getAllLearningContent() {
  const [lessonSnapshot, gameSnapshot] = await Promise.all([
    get(ref(database, "lessons")),
    get(ref(database, "games")),
  ]);
  return [
    ...normalizeSnapshot(lessonSnapshot, "lesson"),
    ...normalizeSnapshot(gameSnapshot, "game"),
  ];
}

export async function updateUserStatus(uid, status) {
  if (!uid) throw new Error("User UID is required.");
  if (!["active", "disabled"].includes(status)) throw new Error("Invalid account status.");
  await update(ref(database, `users/${uid}`), { status, updatedAt: Date.now() });
}

export async function updateStudentGrade(uid, gradeLevel) {
  const snapshot = await get(ref(database, `users/${uid}`));
  if (!snapshot.exists()) throw new Error("Student account not found.");
  return updateStudentClass(uid, gradeLevel, snapshot.val().section || "Section 1");
}

export async function updateStudentClass(uid, gradeLevel, section) {
  const snapshot = await get(ref(database, `users/${uid}`));
  if (!snapshot.exists()) throw new Error("Student account not found.");
  const current = snapshot.val();
  const nextClass = await getActiveClassFields(gradeLevel, section);
  const changes = {
    [`users/${uid}/grade`]: nextClass.grade,
    [`users/${uid}/gradeLevel`]: nextClass.gradeLevel,
    [`users/${uid}/gradeKey`]: nextClass.gradeKey,
    [`users/${uid}/section`]: nextClass.section,
    [`users/${uid}/sectionKey`]: nextClass.sectionKey,
    [`users/${uid}/classKey`]: nextClass.classKey,
    [`users/${uid}/updatedAt`]: Date.now(),
    [`classRosters/${nextClass.classKey}/${uid}`]: true,
  };
  if (current.classKey && current.classKey !== nextClass.classKey) {
    changes[`classRosters/${current.classKey}/${uid}`] = null;
  }
  await update(ref(database), changes);
  return nextClass;
}

export async function updateTeacherAssignment(uid, assignedClasses) {
  const structure = await getSchoolStructure();
  const assignments = activeAssignedClasses(normalizeAssignedClasses(assignedClasses), structure);
  if (!Object.keys(assignments).length) throw new Error("Assign at least one grade and section.");
  const users = await getUsers();
  const requestedClassKeys = Object.keys(assignments);
  const existingAdviser = users.find((profile) => profile.role === "teacher"
    && profile.uid !== uid
    && requestedClassKeys.some((classKey) => normalizeAssignedClasses(profile.assignedClasses)[classKey]));
  if (existingAdviser) {
    throw new Error(`One selected section is already assigned to ${existingAdviser.name || existingAdviser.email}.`);
  }
  return replaceTeacherAssignment(uid, assignments);
}

export async function replaceTeacherAssignment(uid, assignedClasses) {
  const structure = await getSchoolStructure();
  const assignments = activeAssignedClasses(normalizeAssignedClasses(assignedClasses), structure);
  await update(ref(database, `users/${uid}`), {
    assignedClasses: Object.keys(assignments).length ? assignments : null,
    assignedGrades: Object.keys(assignments).length ? assignedGradeMap(assignments, structure) : null,
    teachingScope: "assigned-classes",
    gradeLevel: null,
    updatedAt: Date.now(),
  });
  return assignments;
}

export async function updateContentStatus(type, id, status) {
  if (!["lesson", "game"].includes(type)) throw new Error("Invalid content type.");
  if (!["draft", "published", "archived"].includes(status)) {
    throw new Error("Invalid content status.");
  }

  const node = type === "game" ? "games" : "lessons";
  const snapshot = await get(ref(database, `${node}/${id}`));
  if (!snapshot.exists()) throw new Error("Learning content was not found.");
  const content = snapshot.val();
  const grade = normalizeGradeLevel(content.grade || content.gradeLevel);
  if (status === "published" && !grade) {
    throw new Error("Select a valid administrator-configured grade before publishing this content.");
  }

  const now = Date.now();
  const targetClass = classFields(grade, normalizeSection(content.section, ALL_SECTIONS));
  const plural = type === "game" ? "games" : "lessons";
  const catalogPath = `publishedCatalog/${gradeToKey(grade)}/${plural}/${id}`;
  const changes = {
    [`${node}/${id}/status`]: status,
    [`${node}/${id}/grade`]: targetClass.grade,
    [`${node}/${id}/gradeKey`]: targetClass.gradeKey,
    [`${node}/${id}/section`]: targetClass.section,
    [`${node}/${id}/sectionKey`]: targetClass.sectionKey,
    [`${node}/${id}/classKey`]: targetClass.classKey,
    [`${node}/${id}/updatedAt`]: now,
  };
  const previousGradeKey = content.gradeKey || gradeToKey(content.grade || content.gradeLevel);
  changes[`publishedCatalog/${previousGradeKey}/${plural}/${id}`] = null;
  if (status === "published") {
    changes[catalogPath] = catalogMetadata({ ...content, grade, updatedAt: now }, type);
  }
  await update(ref(database), changes);
}

export async function syncPublishedCatalog() {
  const content = await getAllLearningContent();
  const catalog = {};
  let publishedCount = 0;
  let skippedCount = 0;

  content.forEach((item) => {
    if (!["published", "scheduled"].includes(item.status)) return;
    const grade = normalizeGradeLevel(item.grade || item.gradeLevel);
    if (!grade) {
      skippedCount += 1;
      return;
    }
    const key = gradeToKey(grade);
    const plural = item.type === "game" ? "games" : "lessons";
    catalog[key] ||= {};
    catalog[key][plural] ||= {};
    catalog[key][plural][item.id] = catalogMetadata({ ...item, grade }, item.type);
    publishedCount += 1;
  });

  await set(ref(database, "publishedCatalog"), Object.keys(catalog).length ? catalog : null);
  return { publishedCount, skippedCount };
}

export async function getPublishedCatalogHealth() {
  const [catalogSnapshot, content] = await Promise.all([
    get(ref(database, "publishedCatalog")),
    getAllLearningContent(),
  ]);
  const catalogItems = catalogSnapshot.exists()
    ? flattenPublishedCatalog(catalogSnapshot.val())
    : [];
  const publishedSource = content.filter((item) => item.status === "published");
  return {
    catalogCount: catalogItems.length,
    publishedSourceCount: publishedSource.length,
    needsSync: catalogItems.length !== publishedSource.length,
  };
}

export async function getAcademicSettings() {
  const snapshot = await get(ref(database, "academicSettings"));
  return snapshot.exists() ? snapshot.val() : {};
}

export async function saveAcademicSettings(settings) {
  const nextSettings = toRealtimeData({ ...settings, updatedAt: Date.now() });
  await update(ref(database, "academicSettings"), nextSettings);
  return nextSettings;
}

async function getStudentProgressEntries(students) {
  return Promise.all(
    students.map(async (student) => {
      try {
        return [student.uid, await getUserProgress(student.uid)];
      } catch (error) {
        console.warn(`Unable to read progress for ${student.uid}:`, error);
        return [student.uid, normalizeProgress({})];
      }
    }),
  );
}

export async function getAdminOverview() {
  const [users, content] = await Promise.all([getUsers(), getAllLearningContent()]);
  const students = users.filter((item) => item.role === "student");
  const teachers = users.filter((item) => item.role === "teacher");
  const progressEntries = await getStudentProgressEntries(students);
  const progressByUser = Object.fromEntries(progressEntries);
  const analyticsGrades = [...new Set([
    ...DEFAULT_GRADES,
    ...students.map((student) => normalizeGradeLevel(student.gradeLevel)).filter(Boolean),
  ])];
  const gradeEngagement = Object.fromEntries(
    analyticsGrades.map((grade) => [grade, {
      grade,
      students: 0,
      gamePlays: 0,
      gamesTouched: 0,
      lessonCompletions: 0,
    }]),
  );
  const gamePlaysById = {};
  const activity = [];

  students.forEach((student) => {
    const grade = normalizeGradeLevel(student.gradeLevel);
    if (!gradeEngagement[grade]) return;
    gradeEngagement[grade].students += 1;
    const studentProgress = progressByUser[student.uid] || normalizeProgress({});

    Object.entries(studentProgress.game || {}).forEach(([gameId, gameProgress]) => {
      const playCount = Math.max(1, safeNumber(gameProgress.playCount || gameProgress.gameSessions));
      gradeEngagement[grade].gamePlays += playCount;
      gradeEngagement[grade].gamesTouched += 1;
      gamePlaysById[gameId] = safeNumber(gamePlaysById[gameId]) + playCount;
      if (gameProgress.lastPlayedAt) {
        activity.push({
          type: "game",
          uid: student.uid,
          studentName: student.name || student.email,
          grade,
          contentId: gameId,
          timestamp: gameProgress.lastPlayedAt,
        });
      }
    });

    Object.entries(studentProgress.lesson || {}).forEach(([lessonId, lessonProgress]) => {
      if (lessonProgress.completed) gradeEngagement[grade].lessonCompletions += 1;
      const timestamp = lessonProgress.completedAt || lessonProgress.updatedAt;
      if (timestamp) {
        activity.push({
          type: "lesson",
          uid: student.uid,
          studentName: student.name || student.email,
          grade,
          contentId: lessonId,
          timestamp,
        });
      }
    });
  });

  const contentByKey = Object.fromEntries(content.map((item) => [item.id, item]));
  const topGames = Object.entries(gamePlaysById)
    .map(([id, plays]) => ({
      id,
      plays,
      title: contentByKey[id]?.title || "Learning Game",
      grade: normalizeGradeLevel(contentByKey[id]?.grade || contentByKey[id]?.gradeLevel),
    }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5);
  const gradeRows = analyticsGrades.map((grade) => gradeEngagement[grade]);

  return {
    users,
    students,
    teachers,
    content,
    progressByUser,
    gradeEngagement: gradeRows,
    topGames,
    recentActivity: activity.sort((a, b) => b.timestamp - a.timestamp).slice(0, 12),
    totals: {
      administrators: users.filter((item) => item.role === "admin").length,
      teachers: teachers.length,
      students: students.length,
      activeAccounts: users.filter((item) => item.status !== "disabled").length,
      lessons: content.filter((item) => item.type === "lesson").length,
      games: content.filter((item) => item.type === "game").length,
      publishedContent: content.filter((item) => item.status === "published").length,
      gamePlays: gradeRows.reduce((sum, item) => sum + item.gamePlays, 0),
      lessonCompletions: gradeRows.reduce((sum, item) => sum + item.lessonCompletions, 0),
    },
  };
}
