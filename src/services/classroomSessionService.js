import { get, push, ref, set, update } from "firebase/database";
import { auth, database } from "../firebase/firebaseConfig";
import { classFields, teacherCanAccessClass } from "../data/schoolClasses";
import { getTeacherGames, getTeacherQuizzes } from "./dataService";
import { CAMERA_TRACKS, cameraProgramQuestions, getTeacherCameraPrograms } from "./cameraContentService";

function clean(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value, maximum = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function safeKey(value, fallback) {
  return text(value, 100).replace(/[.#$\[\]/]/g, "_") || fallback;
}

function shuffleItems(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function selectGameQuestions(game, questions) {
  const pool = game?.randomizeQuestions === false ? questions : shuffleItems(questions);
  const limit = Number(game?.questionLimit || pool.length);
  return pool.slice(0, Math.max(1, limit));
}

function values(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

async function activeTeacher(teacherId) {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== teacherId) {
    throw new Error("Sign in again before opening a classroom session.");
  }
  const snapshot = await get(ref(database, `users/${teacherId}`));
  const teacher = snapshot.exists() ? snapshot.val() : null;
  if (!teacher || teacher.role !== "teacher" || teacher.status !== "active") {
    throw new Error("An active teacher account is required.");
  }
  return teacher;
}

function normalizeChoiceQuestion(question, index, prefix) {
  const choices = values(question?.choices || question?.options)
    .map((choice) => text(choice, 300))
    .filter(Boolean)
    .slice(0, 12);
  const answerIndex = Number.isInteger(Number(question?.answerIndex))
    ? Math.max(0, Math.min(choices.length - 1, Number(question.answerIndex)))
    : Math.max(0, choices.findIndex((choice) => choice === text(question?.answer, 300)));
  const correctAnswer = text(question?.answer, 300) || choices[answerIndex] || "";
  return {
    id: safeKey(question?.id, `${prefix}-${index + 1}`),
    type: "choice",
    prompt: text(question?.prompt || question?.question, 700),
    description: text(question?.description, 500),
    choices,
    answerIndex,
    correctAnswer,
    explanation: text(question?.explanation || question?.coachingTip, 700),
    points: Math.max(0, number(question?.points, 1)),
  };
}

function normalizeGameQuestions(game) {
  return values(game?.questions)
    .map((question, index) => normalizeChoiceQuestion(question, index, `game-${game.id || "item"}`))
    .filter((question) => question.prompt && question.choices.length >= 2 && question.correctAnswer);
}

function normalizeQuizQuestions(quiz) {
  return values(quiz?.questions).map((question, index) => {
    const id = safeKey(question?.id, `quiz-${quiz.id || "item"}-${index + 1}`);
    const base = {
      id,
      prompt: text(question?.prompt, 700),
      description: text(question?.description, 500),
      explanation: "",
      points: Math.max(0, number(question?.points, 1)),
    };
    if (question?.type === "checkboxes") {
      return {
        ...base,
        type: "multiple",
        choices: values(question.options).map((choice) => text(choice, 300)).filter(Boolean),
        correctIndices: values(question.correctAnswers).map(Number).filter(Number.isInteger),
      };
    }
    if (question?.type === "short-answer") {
      return {
        ...base,
        type: "text",
        acceptedAnswers: values(question.acceptedAnswers).map((answer) => text(answer, 300)).filter(Boolean),
        caseSensitive: Boolean(question.caseSensitive),
      };
    }
    if (question?.type === "paragraph") {
      return { ...base, type: "manual", readingText: "", manualLabel: "Teacher review" };
    }
    return normalizeChoiceQuestion(question, index, `quiz-${quiz.id || "item"}`);
  }).filter((question) => question.prompt);
}

function normalizeCameraQuestions(program) {
  const meta = CAMERA_TRACKS[program.track] || CAMERA_TRACKS.math;
  return cameraProgramQuestions(program).map((question, index) => {
    const cameraFields = {
      cameraTrack: meta.id,
      cameraKind: meta.kind,
      sequenceSeparator: meta.sequenceSeparator,
    };
    if (meta.kind === "reading") {
      return {
        ...cameraFields,
        id: safeKey(question.id, `camera-reading-${index + 1}`),
        type: "manual",
        prompt: question.prompt || "Read this aloud",
        readingText: text(question.readingText, 700),
        correctAnswer: text(question.answer, 700),
        explanation: text(question.explanation, 700),
        points: 1,
        manualLabel: "Reading check",
        passAccuracy: number(question.passAccuracy, 70),
      };
    }
    if (meta.kind === "sequence") {
      return {
        ...cameraFields,
        id: safeKey(question.id, `camera-${meta.id}-${index + 1}`),
        type: "text",
        prompt: text(question.prompt, 700),
        choices: values(question.choices).map((choice) => text(choice, 100)).filter(Boolean),
        acceptedAnswers: [text(question.answer, 300)],
        correctAnswer: text(question.answer, 300),
        explanation: text(question.explanation, 700),
        points: 1,
      };
    }
    return {
      ...normalizeChoiceQuestion(question, index, `camera-${meta.id}-${program.level}`),
      ...cameraFields,
    };
  });
}

function activityMatchesClass(activity, targetClass) {
  return activity?.classKey === targetClass.key
    || (activity?.grade === targetClass.grade && activity?.section === "All Sections");
}

export async function getClassroomActivities({ teacherId, teacherProfile, targetClass }) {
  if (!targetClass?.key) return [];
  const teacher = await activeTeacher(teacherId);
  if (!teacherCanAccessClass(teacher, targetClass.grade, targetClass.section)) {
    throw new Error("This Grade and Section is outside your assigned teaching scope.");
  }
  const [games, quizzes, cameraPrograms] = await Promise.all([
    getTeacherGames(teacherId),
    getTeacherQuizzes(teacherId),
    getTeacherCameraPrograms(teacherProfile || teacher),
  ]);

  const gameActivities = games
    .filter((game) => game.status === "published" && activityMatchesClass(game, targetClass))
    .map((game) => ({
      id: game.id,
      key: `game-${game.id}`,
      type: "game",
      label: "Learning game",
      title: game.title || "Untitled game",
      subject: game.subject || "General",
      grade: game.grade,
      section: game.section,
      classKey: game.classKey,
      questions: selectGameQuestions(game, normalizeGameQuestions(game)),
      updatedAt: number(game.updatedAt || game.publishedAt),
    }));

  const quizActivities = quizzes
    .filter((quiz) => quiz.status === "published" && activityMatchesClass(quiz, targetClass))
    .map((quiz) => ({
      id: quiz.id,
      key: `quiz-${quiz.id}`,
      type: "quiz",
      label: "Published quiz",
      title: quiz.title || "Untitled quiz",
      subject: quiz.subject || "General",
      grade: quiz.grade,
      section: quiz.section,
      classKey: quiz.classKey,
      questions: quiz.randomizeQuestions === false ? normalizeQuizQuestions(quiz) : shuffleItems(normalizeQuizQuestions(quiz)).slice(0, Number(quiz.questionLimit || normalizeQuizQuestions(quiz).length)),
      updatedAt: number(quiz.updatedAt || quiz.publishedAt),
    }));

  const cameraActivities = cameraPrograms
    .filter((program) => program.status === "published" && program.teacherId === teacherId && program.classKey === targetClass.key)
    .map((program) => {
      const meta = CAMERA_TRACKS[program.track] || CAMERA_TRACKS.math;
      return {
      id: `${program.track}-level-${program.level}`,
      key: `camera-${program.classKey}-${program.track}-${program.level}`,
      type: `camera-${meta.id}`,
      cameraTrack: meta.id,
      cameraKind: meta.kind,
      label: meta.label,
      title: program.title || `${meta.label} · Level ${program.level}`,
      subject: program.subject || meta.subject,
      grade: program.grade,
      section: program.section,
      classKey: program.classKey,
      questions: normalizeCameraQuestions(program),
      updatedAt: number(program.updatedAt || program.publishedAt),
      };
    });

  return [...gameActivities, ...quizActivities, ...cameraActivities]
    .filter((activity) => activity.questions.length > 0)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title));
}

export async function createSharedDeviceLearner({ teacherId, targetClass, name, learnerNumber = "" }) {
  const teacher = await activeTeacher(teacherId);
  if (!targetClass?.grade || !targetClass?.section || !teacherCanAccessClass(teacher, targetClass.grade, targetClass.section)) {
    throw new Error("Select one of your assigned Grade and Section classes.");
  }
  const learnerName = text(name, 120);
  if (learnerName.length < 2) throw new Error("Enter the learner’s complete name.");
  const target = classFields(targetClass.grade, targetClass.section);
  const existingSnapshot = await get(ref(database, `classLearners/${target.classKey}`));
  const duplicate = existingSnapshot.exists() && Object.values(existingSnapshot.val()).some((learner) => (
    learner?.status !== "archived" && text(learner?.name, 120).toLowerCase() === learnerName.toLowerCase()
  ));
  if (duplicate) throw new Error(`${learnerName} is already listed in this section.`);

  const learnerRef = push(ref(database, `classLearners/${target.classKey}`));
  if (!learnerRef.key) throw new Error("A learner record ID could not be created.");
  const now = Date.now();
  const record = clean({
    id: learnerRef.key,
    uid: learnerRef.key,
    name: learnerName,
    learnerNumber: text(learnerNumber, 40),
    ...target,
    source: "shared-device",
    status: "active",
    createdBy: teacherId,
    createdByName: text(teacher.name || teacher.email || "Teacher", 120),
    createdAt: now,
    updatedAt: now,
  });
  await set(learnerRef, record);
  return record;
}

export function evaluateClassroomAnswer(question, answer) {
  if (!question) return { correct: false, answerText: "", correctAnswer: "" };
  if (question.type === "manual") {
    const correct = answer === "teacher-correct";
    return {
      correct,
      answerText: correct ? "Teacher marked correct" : "Teacher marked needs practice",
      correctAnswer: question.correctAnswer || "Teacher observation",
    };
  }
  if (question.type === "multiple") {
    const actual = values(answer).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    const expected = values(question.correctIndices).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    const correct = actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    return {
      correct,
      answerText: actual.map((index) => question.choices?.[index]).filter(Boolean).join(", "),
      correctAnswer: expected.map((index) => question.choices?.[index]).filter(Boolean).join(", "),
    };
  }
  if (question.type === "text") {
    const raw = text(answer, 700);
    const normalized = question.caseSensitive ? raw : raw.toLowerCase();
    const accepted = values(question.acceptedAnswers).map((value) => question.caseSensitive ? text(value, 700) : text(value, 700).toLowerCase());
    return { correct: accepted.includes(normalized), answerText: raw, correctAnswer: values(question.acceptedAnswers).join(" / ") };
  }
  const selectedIndex = Number(answer);
  const answerText = question.choices?.[selectedIndex] || text(answer, 300);
  return {
    correct: answerText === question.correctAnswer || selectedIndex === Number(question.answerIndex),
    answerText,
    correctAnswer: question.correctAnswer || question.choices?.[question.answerIndex] || "",
  };
}

export async function startClassroomSession({ teacherId, learner, activity }) {
  const teacher = await activeTeacher(teacherId);
  if (!learner?.uid || !activity?.id || !activity?.questions?.length) {
    throw new Error("Choose a learner and a playable activity.");
  }
  if (!teacherCanAccessClass(teacher, learner.gradeLevel, learner.section)) {
    throw new Error("This learner is outside your assigned teaching scope.");
  }
  const sessionRef = push(ref(database, `classroomSessions/${teacherId}/${learner.classKey}/${learner.uid}`));
  if (!sessionRef.key) throw new Error("A classroom session ID could not be created.");
  const now = Date.now();
  const record = clean({
    id: sessionRef.key,
    teacherId,
    teacherName: text(teacher.name || teacher.email || "Teacher", 120),
    learnerId: learner.uid,
    learnerName: text(learner.name, 120),
    learnerSource: learner.source === "shared-device" ? "shared-device" : "account",
    grade: learner.gradeLevel,
    section: learner.section,
    classKey: learner.classKey,
    contentId: activity.id,
    contentType: activity.type,
    contentTitle: text(activity.title, 160),
    subject: text(activity.subject || "General", 80),
    status: "in-progress",
    totalItems: activity.questions.length,
    answeredItems: 0,
    correctCount: 0,
    wrongCount: 0,
    accuracyPercent: 0,
    responses: {},
    startedAt: now,
    updatedAt: now,
  });
  await set(sessionRef, record);
  return record;
}

export async function saveClassroomProgress(session, responses) {
  if (!session?.id || !session?.classKey || !session?.learnerId) throw new Error("The classroom session is not available.");
  if (!auth.currentUser || auth.currentUser.uid !== session.teacherId) throw new Error("Sign in again before saving this classroom session.");
  const responseValues = Object.values(responses || {});
  const correctCount = responseValues.filter((response) => response.correct === true).length;
  const wrongCount = responseValues.filter((response) => response.correct === false).length;
  const answeredItems = responseValues.length;
  const accuracyPercent = answeredItems ? Math.round((correctCount / answeredItems) * 100) : 0;
  const updatedAt = Date.now();
  await update(ref(database, `classroomSessions/${session.teacherId}/${session.classKey}/${session.learnerId}/${session.id}`), clean({
    responses,
    answeredItems,
    correctCount,
    wrongCount,
    accuracyPercent,
    updatedAt,
  }));
  return { answeredItems, correctCount, wrongCount, accuracyPercent, updatedAt };
}

export async function completeClassroomSession(session, responses) {
  const summary = await saveClassroomProgress(session, responses);
  const completedAt = Date.now();
  await update(ref(database, `classroomSessions/${session.teacherId}/${session.classKey}/${session.learnerId}/${session.id}`), {
    status: "completed",
    completedAt,
    updatedAt: completedAt,
  });
  return { ...summary, completedAt, status: "completed" };
}

export async function getClassroomSessionRecords({ teacherId, targetClass }) {
  if (!targetClass?.key) return [];
  const teacher = await activeTeacher(teacherId);
  if (!teacherCanAccessClass(teacher, targetClass.grade, targetClass.section)) {
    throw new Error("This Grade and Section is outside your assigned teaching scope.");
  }
  const snapshot = await get(ref(database, `classroomSessions/${teacherId}/${targetClass.key}`));
  if (!snapshot.exists()) return [];
  return Object.values(snapshot.val()).flatMap((learnerSessions) => values(learnerSessions))
    .filter((session) => session?.teacherId === teacherId)
    .sort((left, right) => number(right.completedAt || right.startedAt) - number(left.completedAt || left.startedAt));
}
