import { get, onValue, ref, update } from "firebase/database";
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
    questionLabel: "Clue or question", questionPlaceholder: "Example: Which picture shows rainy weather?",
    answerLabel: "Correct match label", answerPlaceholder: "Rain", choiceLabel: "Match option",
    explanationLabel: "Matching feedback", explanationPlaceholder: "Explain the visual clue in clear learner-friendly language.",
    importHint: "clue | answer | option A | B | C | D | feedback", choiceCount: 4, itemNoun: "match",
    dropTitle: "MATCH HERE", dropInstruction: "Drop the best match",
    playInstruction: "Pinch the best picture, symbol, or word and drag it to the match box.", musicTheme: "arcade",
    supportsImages: true,
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
  const supportsImages = Boolean(meta.supportsImages);
  return Array.from({ length: ITEMS_PER_LEVEL }, (_, index) => (
    meta.kind === "reading"
      ? { id: `item-${index + 1}`, readingText: "", coachingTip: "", skill: "Reading fluency", passAccuracy: 70 }
      : {
          id: `item-${index + 1}`,
          prompt: "",
          promptImageUrl: supportsImages ? null : undefined,
          answer: "",
          choices: meta.kind === "boolean"
            ? ["True", "False"]
            : Array.from({ length: meta.choiceCount || 4 }, () => (
              supportsImages ? { label: "", imageUrl: null } : ""
            )),
          explanation: "",
          skill: meta.kind === "sequence" ? "Sequencing" : "Problem solving",
        }
  ));
}

function normalizeChoiceEntry(choice, supportsImages) {
  if (choice && typeof choice === "object") {
    const label = text(choice.label ?? choice.text ?? choice.value ?? "", supportsImages ? 120 : 80);
    const imageUrl = supportsImages ? text(choice.imageUrl || choice.image || "", 120000) : "";
    return supportsImages ? { label, imageUrl: imageUrl || null } : label;
  }
  const label = text(choice, supportsImages ? 120 : 80);
  return supportsImages ? { label, imageUrl: null } : label;
}

export function choiceLabel(choice) {
  if (choice && typeof choice === "object") return text(choice.label ?? choice.text ?? choice.value ?? "", 120);
  return text(choice, 120);
}

export function choiceImageUrl(choice) {
  if (choice && typeof choice === "object") return text(choice.imageUrl || choice.image || "", 120000) || null;
  return null;
}

function normalizeInteractiveItem(item, index, track) {
  const meta = CAMERA_TRACKS[trackId(track)];
  const supportsImages = Boolean(meta.supportsImages);
  const rawChoices = Array.isArray(item?.choices) ? item.choices.slice(0, meta.choiceCount || 4) : [];
  let choices = rawChoices.map((choice) => normalizeChoiceEntry(choice, supportsImages));
  if (meta.kind === "boolean") {
    choices = supportsImages
      ? [{ label: "True", imageUrl: null }, { label: "False", imageUrl: null }]
      : ["True", "False"];
  }
  while (choices.length < (meta.choiceCount || 4)) {
    choices.push(supportsImages ? { label: "", imageUrl: null } : "");
  }
  const answer = text(item?.answer, supportsImages ? 120 : 80);
  return {
    id: `item-${index + 1}`,
    prompt: text(item?.prompt, 400),
    promptImageUrl: supportsImages ? (text(item?.promptImageUrl || "", 120000) || null) : null,
    answer,
    choices,
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

/** True when choice options are distinct enough to publish. */
function choicesAreDistinct(choices, supportsImages = false) {
  const keys = (choices || []).map((choice) => {
    const label = choiceLabel(choice).toLowerCase();
    const imageUrl = choiceImageUrl(choice) || "";
    // Picture track: same label is OK if the pictures differ.
    if (supportsImages && imageUrl) return `img:${imageUrl}`;
    return `label:${label}`;
  });
  return keys.length > 0 && new Set(keys).size === keys.length;
}

export function cameraItemIsComplete(item, track = "math") {
  const normalizedTrack = trackId(track);
  const meta = CAMERA_TRACKS[normalizedTrack];
  const normalized = meta.kind === "reading"
    ? normalizeReadingItem(item, 0)
    : normalizeInteractiveItem(item, 0, normalizedTrack);
  if (meta.kind === "reading") {
    return normalized.readingText.split(/\s+/).filter(Boolean).length >= 3 && Boolean(normalized.coachingTip);
  }
  const labels = normalized.choices.map(choiceLabel);
  if (!normalized.prompt || !normalized.explanation) return false;
  // Sequence tracks can derive the answer from the ordered blocks when the answer field is left empty.
  if (meta.kind !== "sequence" && !normalized.answer) return false;
  if (labels.some((label) => !label)) return false;
  if (meta.kind === "boolean") {
    return labels.some((label) => label.toLowerCase() === normalized.answer.toLowerCase());
  }
  if (meta.kind === "sequence") {
    const joined = normalizedSequence(labels, meta.sequenceSeparator);
    if (!joined) return false;
    const answerNorm = normalizedSequence(normalized.answer, meta.sequenceSeparator);
    // Accept when answer is empty (will be filled on save) or when it matches the ordered blocks.
    return !answerNorm || joined === answerNorm;
  }
  // Uniqueness is a soft tip only — never blocks "ready" or publish.
  return labels.some((label) => label.toLowerCase() === normalized.answer.toLowerCase());
}

export function validateCameraItems(items, track = "math") {
  const normalizedTrack = trackId(track);
  const meta = CAMERA_TRACKS[normalizedTrack];
  const normalized = normalizeCameraItems(items, normalizedTrack);
  const errors = [];
  const warnings = [];
  const itemName = (index) => {
    const noun = meta.itemNoun || "Activity";
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${index + 1}`;
  };

  if (meta.kind === "reading") {
    normalized.forEach((item, index) => {
      if (item.readingText.split(/\s+/).filter(Boolean).length < 3) {
        errors.push(`Reading item ${index + 1} needs at least three words.`);
      }
      if (!item.coachingTip) errors.push(`Reading item ${index + 1} needs a coaching tip.`);
    });
  } else {
    normalized.forEach((item, index) => {
      const name = itemName(index);
      const labels = item.choices.map(choiceLabel);
      if (!item.prompt) errors.push(`${name} needs a question or clue.`);
      if (meta.kind !== "boolean") {
        if (labels.some((label) => !label)) {
          errors.push(`${name} needs ${meta.choiceCount} complete ${String(meta.choiceLabel || "choice").toLowerCase()} labels.`);
        }
        if (meta.kind !== "sequence" && !choicesAreDistinct(item.choices, Boolean(meta.supportsImages))) {
          if (meta.supportsImages) {
            warnings.push(`${name}: different pictures or labels help students tell options apart.`);
          } else {
            warnings.push(`${name}: different choice labels are recommended so options are not confusing.`);
          }
        }
      }
      if (meta.kind === "sequence") {
        if (labels.every(Boolean)) {
          // Always keep answer in sync with the ordered blocks when they are complete.
          // Teachers may still edit the answer field; a mismatch will surface as an error.
          if (!item.answer) {
            item.answer = labels.join(meta.sequenceSeparator || " ");
          }
        }
        if (normalizedSequence(labels, meta.sequenceSeparator) !== normalizedSequence(item.answer, meta.sequenceSeparator)) {
          const joinedPreview = labels.join(meta.sequenceSeparator === "" ? "" : " ");
          errors.push(`${name}: the ordered blocks join to "${joinedPreview}" but the correct answer is "${item.answer || "(empty)"}". Make them match (blocks are the pieces the student arranges).`);
        }
      } else {
        if (!item.answer) errors.push(`${name} needs a correct answer.`);
        else if (!labels.some((label) => label.toLowerCase() === item.answer.toLowerCase())) {
          errors.push(`${name} must include the correct answer among its choices.`);
        }
      }
      if (!item.explanation) errors.push(`${name} needs feedback or an explanation.`);
      if (meta.supportsImages) {
        const withImages = item.choices.filter((choice) => choiceImageUrl(choice)).length;
        if (withImages === 0) {
          warnings.push(`${name}: add pictures to the options so students can match visually (emoji/text still works).`);
        }
      }
    });
  }

  const signatureOwners = new Map();
  const duplicateIndexes = new Set();
  normalized.forEach((item, index) => {
    const signature = text(meta.kind === "reading" ? item.readingText : item.prompt, 700).toLowerCase();
    if (!signature) return;
    if (signatureOwners.has(signature)) {
      duplicateIndexes.add(signatureOwners.get(signature));
      duplicateIndexes.add(index + 1);
    } else {
      signatureOwners.set(signature, index + 1);
    }
  });
  if (duplicateIndexes.size > 0) {
    const list = [...duplicateIndexes].sort((a, b) => a - b).join(", ");
    warnings.push(`Tip: activities ${list} share the same statement. Different content is recommended but not required to publish.`);
  }
  return { valid: errors.length === 0, errors, warnings, items: normalized };
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
  // Cross-level content reuse is allowed. Teachers may republish or share similar
  // statements across levels; the student still only plays the exact level opened.

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
export async function deleteTeacherCameraProgram(teacherProfile, { classKey, track, level, grade, section } = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sign in again before deleting camera content.");
  const normalizedTrack = trackId(track);
  const normalizedLevel = integer(level, 0, 1, 10);

  // Resolve classKey + grade/section. Callers may pass classKey only, or grade+section.
  let key = text(classKey, 80);
  let gradeValue = grade;
  let sectionValue = section;
  if (key && (!gradeValue || !sectionValue)) {
    // classKey format: "grade-5__section-1"
    const parts = key.split("__");
    if (parts.length >= 2) {
      const gradePart = parts[0].replace(/^grade-?/i, "");
      const sectionPart = parts.slice(1).join("__").replace(/^section-?/i, "");
      gradeValue = gradeValue || (gradePart ? `Grade ${gradePart}` : "");
      sectionValue = sectionValue || (sectionPart ? `Section ${sectionPart}` : "");
    }
  }
  if (!key && gradeValue && sectionValue) {
    try {
      key = classFields(gradeValue, sectionValue).classKey;
    } catch {
      key = "";
    }
  }
  if (!key) throw new Error("Choose the class that owns this camera level.");

  const relativePath = programPath(key, normalizedTrack, normalizedLevel);
  const existingSnap = await get(ref(database, `cameraPrograms/${relativePath}`));
  const existing = existingSnap.exists() ? existingSnap.val() : null;

  // Access check expects (profile, grade, section) — never the raw classKey string.
  // Creator can always delete their own content (even if class assignment changed later).
  const isCreator = Boolean(existing?.teacherId && existing.teacherId === currentUser.uid);
  const canAccess =
    isCreator
    || teacherProfile?.teachingScope === "schoolwide"
    || teacherProfile?.role === "admin"
    || teacherCanAccessClass(teacherProfile, gradeValue, sectionValue);
  if (!canAccess) {
    throw new Error("You can only delete camera content for classes assigned to you.");
  }

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


/**
 * Realtime subscription to published camera programs for a student class.
 * Emits whenever a teacher publishes, edits, or deletes content for that class.
 */
export function subscribePublishedCameraProgramsForStudent(classKey, onData, onError) {
  const key = text(classKey, 80);
  if (!key) {
    onData([]);
    return () => {};
  }
  let stopped = false;
  let timer = null;
  function emit(programs) {
    if (stopped) return;
    clearTimeout(timer);
    const now = Date.now();
    const active = (programs || []).filter((program) => isCameraProgramActive(program, now));
    onData(active);
    const boundaries = active
      .map((program) => Number(program.expiresAt || 0))
      .filter((time) => Number.isFinite(time) && time > now);
    if (boundaries.length) {
      timer = setTimeout(() => emit(programs), Math.min(2147483647, Math.max(20, Math.min(...boundaries) - now + 20)));
    }
  }
  const unsubscribe = onValue(
    ref(database, `cameraPublished/${key}`),
    (snapshot) => {
      if (!snapshot.exists()) {
        emit([]);
        return;
      }
      const programs = Object.entries(snapshot.val()).flatMap(([track, levels]) =>
        Object.entries(levels || {}).map(([levelKey, record]) =>
          normalizeProgram(record, {
            classKey: key,
            track,
            level: Number(String(levelKey).replace(/\D/g, "")) || 1,
          }),
        ),
      ).filter((program) => program?.status === "published");
      emit(programs);
    },
    (error) => {
      emit([]);
      onError?.(error);
    },
  );
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
  };
}

/** Track IDs that currently have at least one active published level for the class. */
export function activeCameraTracksFromPrograms(programs = []) {
  const tracks = new Set();
  const now = Date.now();
  for (const program of programs) {
    if (program?.status === "published" && isCameraProgramActive(program, now) && program.track) {
      tracks.add(trackId(program.track));
    }
  }
  return tracks;
}

/**
 * Enrich / filter system camera catalog cards so only tracks with live teacher
 * content appear for the student.
 */
export function filterSystemCameraCatalog(systemItems, programs = []) {
  const byTrack = new Map();
  const now = Date.now();
  for (const program of programs) {
    if (!program || program.status !== "published" || !isCameraProgramActive(program, now)) continue;
    const track = trackId(program.track);
    const list = byTrack.get(track) || [];
    list.push(program);
    byTrack.set(track, list);
  }
  return (systemItems || [])
    .filter((item) => {
      if (item?.source !== "system" || item?.type !== "game") return true;
      const track = certificateTrackFromCatalogId(item.id);
      return track && byTrack.has(track);
    })
    .map((item) => {
      if (item?.source !== "system" || item?.type !== "game") return item;
      const track = certificateTrackFromCatalogId(item.id);
      const levels = (byTrack.get(track) || []).slice().sort((a, b) => Number(a.level) - Number(b.level));
      if (!levels.length) return item;
      const latest = levels.reduce((best, current) =>
        Number(current.updatedAt || 0) >= Number(best.updatedAt || 0) ? current : best,
      levels[0]);
      return {
        ...item,
        publishedLevelCount: levels.length,
        publishedLevels: levels.map((level) => Number(level.level)),
        teacherId: latest.teacherId || item.teacherId || null,
        teacherName: latest.teacherName || item.teacherName || null,
        title: levels.length === 1 && latest.title ? latest.title : item.title,
        updatedAt: Math.max(...levels.map((level) => Number(level.updatedAt || 0)), Number(item.updatedAt || 0)),
      };
    });
}

function certificateTrackFromCatalogId(id) {
  const value = String(id || "");
  // ids: camera-math-grade-5, camera-truefalse-grade-5, camera-reading-english-grade-5
  const match = value.match(/^camera-(?:reading-)?([a-z]+)(?:-[a-z]+)?-grade-/i);
  if (!match) return "";
  const raw = match[1].toLowerCase();
  if (raw === "reading") return "english";
  return trackId(raw);
}

export function cameraProgramQuestions(program) {
  if (!program) return [];
  const track = trackId(program.track);
  const meta = CAMERA_TRACKS[track];
  return normalizeCameraItems(program.questions, track).map((item, index) => {
    const shared = {
      id: `${program.classKey}-${track}-level-${program.level}-${index + 1}`,
      cameraTrack: track,
      cameraKind: meta.kind,
      level: program.level,
    };
    if (meta.kind === "reading") {
      return {
        ...shared,
        type: "manual",
        prompt: "Read this aloud",
        readingText: item.readingText,
        answer: item.readingText,
        choices: [],
        explanation: item.coachingTip,
        skill: item.skill,
        language: "english",
        passAccuracy: item.passAccuracy,
      };
    }
    const labels = (item.choices || []).map(choiceLabel);
    const choiceImages = (item.choices || []).map(choiceImageUrl);
    return {
      ...shared,
      type: meta.kind === "sequence" ? "text" : "choice",
      prompt: item.prompt,
      promptImageUrl: item.promptImageUrl || null,
      answer: item.answer,
      choices: labels,
      choiceImages: meta.supportsImages ? choiceImages : undefined,
      acceptedAnswers: meta.kind === "sequence" ? [item.answer] : undefined,
      explanation: item.explanation,
      skill: item.skill,
      sequenceSeparator: meta.sequenceSeparator,
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
