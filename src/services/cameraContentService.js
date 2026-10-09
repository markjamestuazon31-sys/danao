import { get, ref, update } from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";
import { classFields, teacherCanAccessClass } from "../data/schoolClasses";
import { getLearningWeek } from "../utils/gameEngine";

export const CAMERA_TRACKS = Object.freeze({
  math: {
    id: "math", label: "Camera Math", subject: "Mathematics", kind: "choice",
    shortDescription: "Pinch and drag the correct answer",
    questionLabel: "Math problem or question", questionPlaceholder: "Example: Mia has 4 boxes with 6 pencils each. How many pencils?",
    answerLabel: "Correct answer", answerPlaceholder: "24", choiceLabel: "Answer choice",
    explanationLabel: "Worked solution / feedback", explanationPlaceholder: "Explain why the answer is correct in student-friendly language.",
    importHint: "problem | answer | A | B | C | D | solution", choiceCount: 4, itemNoun: "answer",
    dropTitle: "ANSWER BOX", dropInstruction: "Open your hand here",
    playInstruction: "Pinch an answer, drag it to the answer box, then open your hand.", musicTheme: "math",
  },
  english: {
    id: "english", label: "Camera Reading", subject: "English", kind: "reading",
    shortDescription: "Read aloud with camera and voice coaching",
    importHint: "The first 10 complete passages become reading activities", musicTheme: "reading",
  },
  sort: {
    id: "sort", label: "Sort & Classify", subject: "Science", kind: "choice",
    shortDescription: "Drag an item to its correct group",
    questionLabel: "Item or classification question", questionPlaceholder: "Example: A whale belongs to which animal group?",
    answerLabel: "Correct group", answerPlaceholder: "Mammals", choiceLabel: "Group",
    explanationLabel: "Classification feedback", explanationPlaceholder: "Explain the feature that places the item in this group.",
    importHint: "item/question | correct group | group A | B | C | D | feedback", choiceCount: 4, itemNoun: "group",
    dropTitle: "CLASSIFY HERE", dropInstruction: "Drop the correct group",
    playInstruction: "Pinch the correct group, drag it to the classify box, then open your hand.", musicTheme: "arcade",
  },
  sentence: {
    id: "sentence", label: "Sentence Builder", subject: "English", kind: "sequence",
    shortDescription: "Arrange words or phrases in order",
    questionLabel: "Sentence instruction or clue", questionPlaceholder: "Example: Arrange the words to make a complete sentence.",
    answerLabel: "Complete correct sentence", answerPlaceholder: "The pupils read in the library.", choiceLabel: "Word or phrase",
    explanationLabel: "Grammar feedback", explanationPlaceholder: "Explain the correct word order or grammar pattern.",
    importHint: "clue | sentence | block 1 | block 2 | block 3 | block 4 | feedback", choiceCount: 4,
    sequenceSeparator: " ", itemNoun: "word block",
    playInstruction: "Pinch each word block and place the sentence in the correct order.", musicTheme: "reading",
  },
  spelling: {
    id: "spelling", label: "Word Builder", subject: "English", kind: "sequence",
    shortDescription: "Arrange letters or syllables to spell a word",
    questionLabel: "Word clue", questionPlaceholder: "Example: A place where pupils borrow books.",
    answerLabel: "Correct word", answerPlaceholder: "library", choiceLabel: "Letter or syllable",
    explanationLabel: "Spelling feedback", explanationPlaceholder: "Give a short definition or spelling reminder.",
    importHint: "clue | word | block 1 | block 2 | block 3 | block 4 | feedback", choiceCount: 4,
    sequenceSeparator: "", itemNoun: "letter block",
    playInstruction: "Pinch each letter or syllable block and build the word in order.", musicTheme: "reading",
  },
  picture: {
    id: "picture", label: "Picture & Symbol Match", subject: "General", kind: "choice",
    shortDescription: "Match a clue to a picture, symbol, or word",
    questionLabel: "Picture or symbol clue", questionPlaceholder: "Example: Which symbol shows rainy weather?",
    answerLabel: "Correct picture, symbol, or word", answerPlaceholder: "🌧️ Rain", choiceLabel: "Picture, emoji, symbol, or word",
    explanationLabel: "Matching feedback", explanationPlaceholder: "Explain the visual clue in clear learner-friendly language.",
    importHint: "clue | answer | option A | B | C | D | feedback", choiceCount: 4, itemNoun: "match",
    dropTitle: "MATCH HERE", dropInstruction: "Drop the best match",
    playInstruction: "Pinch the best picture, symbol, or word and drag it to the match box.", musicTheme: "arcade",
  },
  truefalse: {
    id: "truefalse", label: "True or False", subject: "General", kind: "boolean",
    shortDescription: "Move True or False to the answer box",
    questionLabel: "Statement", questionPlaceholder: "Example: The Earth moves around the Sun.",
    answerLabel: "Correct answer", answerPlaceholder: "True", choiceLabel: "Answer",
    explanationLabel: "Why it is true or false", explanationPlaceholder: "Give a short factual explanation.",
    importHint: "statement | True/False | explanation", choiceCount: 2, itemNoun: "answer",
    dropTitle: "TRUE OR FALSE", dropInstruction: "Open your hand here",
    playInstruction: "Pinch True or False, move it to the answer box, then open your hand.", musicTheme: "arcade",
  },
});

export const CAMERA_LEVELS = Object.freeze(Array.from({ length: 10 }, (_, index) => index + 1));

const GENERIC_LEVEL_FOCUS = Object.freeze([
  "Recognize familiar examples and core ideas", "Build accuracy with clear choices", "Apply the skill in familiar situations",
  "Explain the reason for an answer", "Use patterns and representations", "Apply the skill to daily-life examples",
  "Distinguish closely related choices", "Reason with unfamiliar examples", "Combine skills and explain evidence",
  "Independent mastery and transfer",
]);

export const CAMERA_LEVEL_FOCUS = Object.freeze({
  math: [
    "Foundation skills and clear one-step solving", "Accuracy and number fluency", "Applying operations in familiar situations",
    "Multi-step thinking and checking work", "Models, patterns, and representations", "Word problems and choosing a strategy",
    "Mixed operations and efficient solutions", "Reasoning with unfamiliar problems", "Integrated challenge and explanation",
    "Independent mastery and transfer",
  ],
  english: [
    "Word accuracy and confident oral reading", "Phrasing and natural pauses", "Punctuation, pace, and expression",
    "Vocabulary in meaningful sentences", "Fluency across connected ideas", "Main idea and supporting detail",
    "Cause, effect, sequence, and inference", "Academic language and complex sentences", "Critical reading with expressive delivery",
    "Independent mastery and communication",
  ],
  sort: GENERIC_LEVEL_FOCUS,
  picture: GENERIC_LEVEL_FOCUS,
  truefalse: GENERIC_LEVEL_FOCUS,
  sentence: [
    "Build clear subject-and-predicate sentences", "Use capital letters and punctuation", "Arrange describing words correctly",
    "Build questions and statements", "Connect ideas with conjunctions", "Use tense consistently", "Arrange longer phrases",
    "Improve clarity and meaning", "Apply varied sentence patterns", "Independent sentence construction",
  ],
  spelling: [
    "Build familiar high-frequency words", "Use common beginning and ending sounds", "Recognize vowel patterns", "Build words with blends",
    "Use syllables to form longer words", "Apply common prefixes and suffixes", "Distinguish confusing spellings",
    "Build subject vocabulary", "Use context to confirm spelling", "Independent word mastery",
  ],
});

const ITEMS_PER_LEVEL = 10;

function text(value, limit = 600) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function integer(value, fallback, minimum, maximum) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function clean(value) {
  return JSON.parse(JSON.stringify(value));
}

function trackId(value) {
  return CAMERA_TRACKS[value] ? value : "math";
}

export function createEmptyCameraItems(track = "math") {
  const meta = CAMERA_TRACKS[trackId(track)];
  return Array.from({ length: ITEMS_PER_LEVEL }, (_, index) => (
    meta.kind === "reading"
      ? { id: `item-${index + 1}`, readingText: "", coachingTip: "", skill: "Reading fluency", passAccuracy: 70 }
      : {
          id: `item-${index + 1}`, prompt: "", answer: "",
          choices: meta.kind === "boolean" ? ["True", "False"] : Array.from({ length: meta.choiceCount || 4 }, () => ""),
          explanation: "", skill: meta.kind === "sequence" ? "Sequencing" : "Problem solving",
        }
  ));
}

function normalizeInteractiveItem(item, index, track) {
  const meta = CAMERA_TRACKS[trackId(track)];
  const choices = Array.isArray(item?.choices)
    ? item.choices.slice(0, meta.choiceCount || 4).map((choice) => text(choice, 80))
    : [];
  if (meta.kind === "boolean") choices.splice(0, choices.length, "True", "False");
  while (choices.length < (meta.choiceCount || 4)) choices.push("");
  return {
    id: `item-${index + 1}`, prompt: text(item?.prompt, 400), answer: text(item?.answer, 80), choices,
    explanation: text(item?.explanation, 600),
    skill: text(item?.skill, 100) || (meta.kind === "sequence" ? "Sequencing" : "Problem solving"),
  };
}

function normalizeReadingItem(item, index) {
  return {
    id: `item-${index + 1}`, readingText: text(item?.readingText || item?.prompt, 700),
    coachingTip: text(item?.coachingTip || item?.explanation, 400),
    skill: text(item?.skill, 100) || "Reading fluency", passAccuracy: integer(item?.passAccuracy, 70, 55, 95),
  };
}

export function normalizeCameraItems(items, track = "math") {
  const normalizedTrack = trackId(track);
  const source = Array.isArray(items) ? items : [];
  return Array.from({ length: ITEMS_PER_LEVEL }, (_, index) => (
    CAMERA_TRACKS[normalizedTrack].kind === "reading"
      ? normalizeReadingItem(source[index], index)
      : normalizeInteractiveItem(source[index], index, normalizedTrack)
  ));
}

function normalizedSequence(value, separator) {
  const source = Array.isArray(value) ? value.join(separator) : String(value || "");
  return separator === " " ? text(source, 400).toLowerCase() : source.replace(/\s+/g, "").trim().toLowerCase();
}

export function cameraItemIsComplete(item, track = "math") {
  const normalizedTrack = trackId(track);
  const meta = CAMERA_TRACKS[normalizedTrack];
  const normalized = meta.kind === "reading" ? normalizeReadingItem(item, 0) : normalizeInteractiveItem(item, 0, normalizedTrack);
  if (meta.kind === "reading") return normalized.readingText.split(/\s+/).filter(Boolean).length >= 3 && Boolean(normalized.coachingTip);
  if (!normalized.prompt || !normalized.answer || !normalized.explanation || normalized.choices.some((choice) => !choice)) return false;
  if (meta.kind === "sequence") return normalizedSequence(normalized.choices, meta.sequenceSeparator) === normalizedSequence(normalized.answer, meta.sequenceSeparator);
  return normalized.choices.some((choice) => choice.toLowerCase() === normalized.answer.toLowerCase());
}

export function validateCameraItems(items, track = "math") {
  const normalizedTrack = trackId(track);
  const meta = CAMERA_TRACKS[normalizedTrack];
  const normalized = normalizeCameraItems(items, normalizedTrack);
  const errors = [];
  normalized.forEach((item, index) => {
    if (meta.kind === "reading") {
      if (item.readingText.split(/\s+/).filter(Boolean).length < 3) errors.push(`Reading item ${index + 1} needs at least three words.`);
      if (!item.coachingTip) errors.push(`Reading item ${index + 1} needs a coaching tip.`);
      return;
    }
    const itemName = `${meta.label} item ${index + 1}`;
    if (!item.prompt) errors.push(`${itemName} needs a question or clue.`);
    if (!item.answer) errors.push(`${itemName} needs a correct answer.`);
    if (item.choices.some((choice) => !choice)) errors.push(`${itemName} needs ${meta.choiceCount} complete ${meta.choiceLabel.toLowerCase()} fields.`);
    if (meta.kind !== "sequence" && new Set(item.choices.map((choice) => choice.toLowerCase())).size !== item.choices.length) errors.push(`${itemName} must use different choices.`);
    if (meta.kind === "sequence") {
      if (normalizedSequence(item.choices, meta.sequenceSeparator) !== normalizedSequence(item.answer, meta.sequenceSeparator)) errors.push(`${itemName} blocks must be entered in the same order as the complete correct answer.`);
    } else if (!item.choices.some((choice) => choice.toLowerCase() === item.answer.toLowerCase())) {
      errors.push(`${itemName} must include the correct answer among its choices.`);
    }
    if (!item.explanation) errors.push(`${itemName} needs feedback or an explanation.`);
  });
  const signatures = normalized.map((item) => text(meta.kind === "reading" ? item.readingText : item.prompt, 700).toLowerCase()).filter(Boolean);
  if (new Set(signatures).size !== signatures.length) errors.push("Every activity in this level must use different content.");
  return { valid: errors.length === 0, errors, items: normalized };
}

function programPath(classKey, track, level) {
  return `${classKey}/${track}/level-${level}`;
}

function normalizeProgram(record, fallback = {}) {
  if (!record || typeof record !== "object") return null;
  const track = trackId(record.track || fallback.track);
  const level = integer(record.level, fallback.level || 1, 1, 10);
  const expiresAt = record.expiresAt == null || record.expiresAt === ""
    ? null
    : Number(record.expiresAt) || null;
  return {
    ...record, track, level, title: text(record.title, 120), competency: text(record.competency, 600),
    instructions: text(record.instructions, 600), questions: normalizeCameraItems(record.questions, track),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  };
}

/** True when the program is still within its optional availability window. */
export function isCameraProgramActive(program, now = Date.now()) {
  if (!program || program.status !== "published") return false;
  if (program.expiresAt == null) return true;
  return Number(program.expiresAt) > now;
}

export async function getTeacherCameraPrograms(profile) {
  const teacherId = auth.currentUser?.uid || "";
  const assignments = Object.entries(profile?.assignedClasses || {}).filter(([, enabled]) => Boolean(enabled)).map(([classKey]) => classKey);
  if (!assignments.length && profile?.teachingScope !== "schoolwide") return [];
  const classKeys = profile?.teachingScope === "schoolwide"
    ? [3, 4, 5, 6].flatMap((grade) => [1, 2, 3, 4, 5, 6].map((section) => `grade-${grade}__section-${section}`))
    : assignments;
  const snapshots = await Promise.all(classKeys.map(async (classKey) => ({ classKey, snapshot: await get(ref(database, `cameraPrograms/${classKey}`)) })));
  return snapshots.flatMap(({ classKey, snapshot }) => {
    if (!snapshot.exists()) return [];
    return Object.entries(snapshot.val()).flatMap(([track, levels]) => Object.entries(levels || {}).map(([levelKey, record]) => normalizeProgram(record, {
      classKey, track, level: Number(levelKey.replace(/\D/g, "")) || 1,
    }))).filter((program) => program && (!teacherId || program.teacherId === teacherId));
  }).sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

export async function saveTeacherCameraProgram(teacherProfile, input) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sign in again before saving camera content.");
  const teacherSnapshot = await get(ref(database, `users/${currentUser.uid}`));
  const serverProfile = teacherSnapshot.exists() ? teacherSnapshot.val() : teacherProfile;
  if (!teacherCanAccessClass(serverProfile, input?.grade, input?.section)) throw new Error("This Grade and Section is outside your administrator-assigned teaching scope.");

  const track = trackId(input?.track);
  const meta = CAMERA_TRACKS[track];
  const level = integer(input?.level, 1, 1, 10);
  const status = input?.status === "published" ? "published" : "draft";
  const validation = validateCameraItems(input?.questions, track);
  if (status === "published" && !validation.valid) throw new Error(validation.errors[0]);
  const targetClass = classFields(input.grade, input.section);
  const relativePath = programPath(targetClass.classKey, track, level);
  const [existingSnapshot, trackSnapshot] = await Promise.all([
    get(ref(database, `cameraPrograms/${relativePath}`)),
    get(ref(database, `cameraPrograms/${targetClass.classKey}/${track}`)),
  ]);
  const existing = existingSnapshot.exists() ? existingSnapshot.val() : {};
  if (status === "published" && trackSnapshot.exists()) {
    const currentSignatures = new Set(validation.items.map((item) => text(meta.kind === "reading" ? item.readingText : item.prompt, 700).toLowerCase()).filter(Boolean));
    const duplicate = Object.entries(trackSnapshot.val()).find(([levelKey, program]) => {
      if (levelKey === `level-${level}` || !program?.questions) return false;
      return normalizeCameraItems(program.questions, track).some((item) => currentSignatures.has(text(meta.kind === "reading" ? item.readingText : item.prompt, 700).toLowerCase()));
    });
    if (duplicate) throw new Error(`This level repeats content already used in Level ${Number(duplicate[0].replace(/\D/g, ""))}. Use different activities for every level.`);
  }

  const now = Date.now();
  const week = getLearningWeek();
  const expiresAtRaw = input?.expiresAt;
  const expiresAt = expiresAtRaw == null || expiresAtRaw === ""
    ? null
    : (typeof expiresAtRaw === "number" ? expiresAtRaw : new Date(expiresAtRaw).getTime());
  if (expiresAt != null && (!Number.isFinite(expiresAt) || expiresAt <= now)) {
    throw new Error("Expiration must be a future date and time.");
  }
  const record = clean({
    ...targetClass, track, cameraKind: meta.kind, subject: meta.subject, level,
    title: text(input.title, 120) || `${meta.label} · Level ${level}`,
    competency: text(input.competency, 600), instructions: text(input.instructions, 600), questions: validation.items,
    status, teacherId: currentUser.uid, teacherName: text(serverProfile?.name || teacherProfile?.name || "Jidanao teacher", 100),
    weekKey: track === "math" ? week.key : "ongoing", weekLabel: track === "math" ? week.label : `Ongoing ${meta.label} practice`,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    createdAt: Number(existing.createdAt || now), updatedAt: now, ...(status === "published" ? { publishedAt: now } : {}),
  });
  await update(ref(database), {
    [`cameraPrograms/${relativePath}`]: record,
    [`cameraPublished/${relativePath}`]: status === "published" ? record : null,
  });
  return normalizeProgram(record);
}

/** Permanently remove a camera level for a class + track + level (draft and published). */
export async function deleteTeacherCameraProgram(teacherProfile, { classKey, track, level } = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sign in again before deleting camera content.");
  const normalizedTrack = trackId(track);
  const normalizedLevel = integer(level, 0, 1, 10);
  const key = text(classKey, 80);
  if (!key) throw new Error("Choose the class that owns this camera level.");
  if (!teacherCanAccessClass(teacherProfile, key) && teacherProfile?.teachingScope !== "schoolwide") {
    throw new Error("You can only delete camera content for classes assigned to you.");
  }
  const relativePath = programPath(key, normalizedTrack, normalizedLevel);
  await update(ref(database), {
    [`cameraPrograms/${relativePath}`]: null,
    [`cameraPublished/${relativePath}`]: null,
  });
  return { classKey: key, track: normalizedTrack, level: normalizedLevel };
}

export async function getPublishedCameraProgramsForStudent(profile) {
  const classKey = text(profile?.classKey, 80);
  if (!classKey) return [];
  const snapshot = await get(ref(database, `cameraPublished/${classKey}`));
  if (!snapshot.exists()) return [];
  const now = Date.now();
  return Object.entries(snapshot.val()).flatMap(([track, levels]) => Object.entries(levels || {}).map(([levelKey, record]) => normalizeProgram(record, {
    classKey, track, level: Number(levelKey.replace(/\D/g, "")) || 1,
  }))).filter((program) => program?.status === "published" && isCameraProgramActive(program, now));
}

export function cameraProgramQuestions(program) {
  if (!program) return [];
  const track = trackId(program.track);
  const meta = CAMERA_TRACKS[track];
  return normalizeCameraItems(program.questions, track).map((item, index) => {
    const shared = { id: `${program.classKey}-${track}-level-${program.level}-${index + 1}`, cameraTrack: track, cameraKind: meta.kind, level: program.level };
    if (meta.kind === "reading") return { ...shared, type: "manual", prompt: "Read this aloud", readingText: item.readingText, answer: item.readingText, choices: [], explanation: item.coachingTip, skill: item.skill, language: "english", passAccuracy: item.passAccuracy };
    return {
      ...shared, type: meta.kind === "sequence" ? "text" : "choice", prompt: item.prompt, answer: item.answer,
      choices: item.choices, acceptedAnswers: meta.kind === "sequence" ? [item.answer] : undefined,
      explanation: item.explanation, skill: item.skill, sequenceSeparator: meta.sequenceSeparator,
    };
  });
}

function parseJsonItems(source, track) {
  try {
    const parsed = JSON.parse(source);
    const items = Array.isArray(parsed) ? parsed : parsed?.questions;
    return Array.isArray(items) ? normalizeCameraItems(items, track) : null;
  } catch {
    return null;
  }
}

export function importCameraItemsFromText(sourceText, track = "math") {
  const source = String(sourceText || "").trim();
  if (!source) throw new Error("The imported document does not contain readable text.");
  const normalizedTrack = trackId(track);
  const meta = CAMERA_TRACKS[normalizedTrack];
  const jsonItems = parseJsonItems(source, normalizedTrack);
  if (jsonItems) return jsonItems;

  if (meta.kind === "reading") {
    const sentences = source.split(/\n+|(?<=[.!?])\s+/).map((value) => text(value, 700)).filter((value) => value.split(/\s+/).length >= 3).slice(0, ITEMS_PER_LEVEL);
    if (sentences.length < ITEMS_PER_LEVEL) throw new Error("The document needs at least 10 complete English sentences or passages.");
    return sentences.map((readingText, index) => ({ id: `item-${index + 1}`, readingText, coachingTip: "Read clearly, pause at punctuation, and use natural expression.", skill: "Accuracy and fluency", passAccuracy: 70 }));
  }

  const rows = source.split(/\n+/).map((value) => value.trim()).filter(Boolean);
  const parsed = rows.map((row, index) => {
    const columns = row.split(/\s*[|\t]\s*/);
    if (meta.kind === "boolean") {
      if (columns.length < 3) return null;
      return normalizeInteractiveItem({ prompt: columns[0], answer: columns[1], choices: ["True", "False"], explanation: columns.slice(2).join(" "), skill: `Teacher skill ${index + 1}` }, index, normalizedTrack);
    }
    const choiceCount = meta.choiceCount || 4;
    if (columns.length < choiceCount + 3) return null;
    return normalizeInteractiveItem({ prompt: columns[0], answer: columns[1], choices: columns.slice(2, 2 + choiceCount), explanation: columns.slice(2 + choiceCount).join(" "), skill: `Teacher skill ${index + 1}` }, index, normalizedTrack);
  }).filter(Boolean).slice(0, ITEMS_PER_LEVEL);
  if (parsed.length < ITEMS_PER_LEVEL) throw new Error(`Add 10 lines in this format: ${meta.importHint}.`);
  return parsed;
}
