export const GRADE_EXPERIENCES = {
  "Grade 3": {
    key: "grade-3",
    theme: "sunrise",
    title: "Curious Explorer",
    encouragement: "Build strong foundations one fun activity at a time.",
    difficulty: "Beginner",
    dailyGoal: 2,
    roundSeconds: 30,
    lessonXp: 120,
    gameXp: 80,
    focus: ["Basic addition", "Subtraction", "Multiplication", "Reading skills"],
    rewards: ["Bright Starter", "Number Scout", "Word Explorer"],
  },
  "Grade 4": {
    key: "grade-4",
    theme: "ocean",
    title: "Brave Builder",
    encouragement: "Connect ideas, practice carefully, and explain your thinking.",
    difficulty: "Developing",
    dailyGoal: 3,
    roundSeconds: 28,
    lessonXp: 135,
    gameXp: 90,
    focus: ["Multi-digit operations", "Vocabulary", "Life cycles", "Paragraph meaning"],
    rewards: ["Skill Builder", "Pattern Finder", "Reading Ranger"],
  },
  "Grade 5": {
    key: "grade-5",
    theme: "violet",
    title: "Knowledge Navigator",
    encouragement: "Use evidence, compare strategies, and challenge yourself.",
    difficulty: "Intermediate",
    dailyGoal: 3,
    roundSeconds: 25,
    lessonXp: 150,
    gameXp: 100,
    focus: ["Fractions", "Decimals", "Scientific reasoning", "Context clues"],
    rewards: ["Fraction Master", "Evidence Seeker", "Logic Navigator"],
  },
  "Grade 6": {
    key: "grade-6",
    theme: "cosmos",
    title: "Master Problem Solver",
    encouragement: "Apply advanced strategies and prepare for the next learning stage.",
    difficulty: "Advanced",
    dailyGoal: 4,
    roundSeconds: 22,
    lessonXp: 170,
    gameXp: 115,
    focus: ["Problem solving", "Ratios and decimals", "Science challenges", "Critical reading"],
    rewards: ["Problem Solver", "Science Strategist", "Critical Reader"],
  },
};

export const BADGE_DEFINITIONS = [
  {
    id: "first-step",
    title: "First Step",
    description: "Start your first learning activity.",
    icon: "footprints",
    test: (summary) => summary.activitiesStarted >= 1,
  },
  {
    id: "lesson-finisher",
    title: "Lesson Finisher",
    description: "Complete your first lesson.",
    icon: "books",
    test: (summary) => summary.lessonsCompleted >= 1,
  },
  {
    id: "lesson-champion",
    title: "Lesson Champion",
    description: "Complete five lessons.",
    icon: "medal",
    test: (summary) => summary.lessonsCompleted >= 5,
  },
  {
    id: "game-starter",
    title: "Game Starter",
    description: "Finish your first learning game.",
    icon: "gamepad",
    test: (summary) => summary.gameSessions >= 1,
  },
  {
    id: "high-scorer",
    title: "High Scorer",
    description: "Earn at least 800 total game points.",
    icon: "trophy",
    test: (summary) => summary.totalGameScore >= 800,
  },
  {
    id: "sharp-mind",
    title: "Sharp Mind",
    description: "Reach 80% answer accuracy after ten questions.",
    icon: "brain",
    test: (summary) => summary.totalQuestions >= 10 && summary.accuracyPercent >= 80,
  },
  {
    id: "three-day-streak",
    title: "Learning Streak",
    description: "Learn on three consecutive days.",
    icon: "flame",
    test: (summary) => summary.longestStreak >= 3,
  },
  {
    id: "camera-math",
    title: "Camera Mathematician",
    description: "Solve a camera-number challenge.",
    icon: "camera",
    test: (summary) => summary.cameraWins >= 1,
  },
  {
    id: "quiz-master",
    title: "Quiz Master",
    description: "Score at least 90% on a lesson quiz.",
    icon: "target",
    test: (summary) => summary.bestQuizScore >= 90,
  },
  {
    id: "xp-collector",
    title: "XP Collector",
    description: "Earn 1,000 experience points.",
    icon: "sparkles",
    test: (summary) => summary.totalXp >= 1000,
  },
  {
    id: "subject-explorer",
    title: "Subject Explorer",
    description: "Complete activities in three subjects.",
    icon: "compass",
    test: (summary) => summary.subjectsExplored >= 3,
  },
  {
    id: "level-five",
    title: "Rising Star",
    description: "Reach learning level five.",
    icon: "zap",
    test: (summary) => summary.level >= 5,
  },
];

export function normalizeGradeLevel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/(?:grade\s*)?(\d{1,2})/i);
  return match ? `Grade ${Number(match[1])}` : text.replace(/\s+/g, " ");
}

export function gradeToKey(value) {
  const normalized = normalizeGradeLevel(value);
  if (GRADE_EXPERIENCES[normalized]?.key) return GRADE_EXPERIENCES[normalized].key;
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "unassigned-grade";
}

export function getGradeExperience(value) {
  const normalized = normalizeGradeLevel(value);
  return GRADE_EXPERIENCES[normalized] || GRADE_EXPERIENCES["Grade 3"];
}

export function levelFromXp(totalXp = 0) {
  const safeXp = Math.max(0, Number(totalXp) || 0);
  let level = 1;
  let levelStartXp = 0;
  let nextLevelXp = 250;

  while (safeXp >= nextLevelXp && level < 50) {
    level += 1;
    levelStartXp = nextLevelXp;
    nextLevelXp += 200 + level * 50;
  }

  const currentLevelXp = safeXp - levelStartXp;
  const requiredXp = nextLevelXp - levelStartXp;

  return {
    level,
    levelStartXp,
    nextLevelXp,
    currentLevelXp,
    requiredXp,
    levelPercent: Math.min(100, Math.round((currentLevelXp / requiredXp) * 100)),
  };
}

export function deriveBadges(summary) {
  return BADGE_DEFINITIONS.map((badge) => ({
    ...badge,
    unlocked: Boolean(badge.test(summary)),
  }));
}

export function subjectTone(subject) {
  const value = String(subject || "").toLowerCase();
  if (value.includes("math")) return "math";
  if (value.includes("science")) return "science";
  if (value.includes("filipino")) return "filipino";
  if (value.includes("reading")) return "reading";
  if (value.includes("english")) return "english";
  return "general";
}

export function difficultyForGrade(grade, fallback) {
  if (fallback) return fallback;
  return getGradeExperience(grade).difficulty;
}

/** Built-in, grade-scoped learning tools shipped as part of Jidanao. */
export function systemCatalogForGrade(value) {
  const grade = normalizeGradeLevel(value);
  if (!GRADE_EXPERIENCES[grade]) return [];
  const experience = getGradeExperience(grade);
  const base = {
    type: "game",
    status: "published",
    source: "system",
    grade,
    difficulty: experience.difficulty,
    estimatedMinutes: 10,
    totalLevels: 10,
    itemsPerLevel: 10,
    builtIn: true,
  };
  return [
    {
      ...base,
      id: `camera-math-${gradeToKey(grade)}`,
      route: "/student/camera-math",
      subject: "Mathematics",
      title: "Weekly Camera Math Mission",
      description: `${experience.difficulty} ${grade} math with floating number choices students pinch, drag, and release into the answer box. A new 10-item mission arrives every week.`,
      competency: experience.focus.filter((item) => /addition|subtraction|multiplication|operation|fraction|decimal|ratio|problem/i.test(item)).join(", "),
      coverEmoji: "✋",
      interaction: "camera-drag",
      weeklyMission: true,
      certificateTrack: "math",
    },
    {
      ...base,
      id: `camera-reading-english-${gradeToKey(grade)}`,
      route: "/student/camera-reading-english",
      subject: "English Reading",
      title: "English Camera Reading",
      description: `${grade}-appropriate English passages with live reading practice, supportive voice feedback, and a Level 10 certificate.`,
      competency: experience.focus.filter((item) => /reading|vocabulary|comprehension|language|critical/i.test(item)).join(", ") || "Fluency, pronunciation, vocabulary, and expression",
      coverEmoji: "📖",
      interaction: "camera-reading",
      language: "english",
      certificateTrack: "english",
    },
    {
      ...base,
      id: `camera-sort-${gradeToKey(grade)}`,
      route: "/student/camera-sort",
      subject: "Science",
      title: "Sort & Classify",
      description: `${grade} classification challenges. Pinch the correct group and drag it into the classify box using the camera.`,
      competency: "Classification, observation, and grouping skills",
      coverEmoji: "🧪",
      interaction: "camera-drag",
      certificateTrack: "sort",
    },
    {
      ...base,
      id: `camera-sentence-${gradeToKey(grade)}`,
      route: "/student/camera-sentence",
      subject: "English",
      title: "Sentence Builder",
      description: `Arrange word blocks in the correct order to build complete ${grade} sentences with camera hand tracking.`,
      competency: "Sentence structure, grammar, and word order",
      coverEmoji: "📝",
      interaction: "camera-sequence",
      certificateTrack: "sentence",
    },
    {
      ...base,
      id: `camera-spelling-${gradeToKey(grade)}`,
      route: "/student/camera-spelling",
      subject: "English",
      title: "Word Builder",
      description: `Build words from letters or syllables using camera hand tracking. Perfect for ${grade} spelling practice.`,
      competency: "Spelling, phonics, and word formation",
      coverEmoji: "🔤",
      interaction: "camera-sequence",
      certificateTrack: "spelling",
    },
    {
      ...base,
      id: `camera-picture-${gradeToKey(grade)}`,
      route: "/student/camera-picture",
      subject: "General",
      title: "Picture & Symbol Match",
      description: `Match clues to pictures, symbols, or words by pinching and dragging with the camera.`,
      competency: "Visual literacy, matching, and symbol recognition",
      coverEmoji: "🖼️",
      interaction: "camera-drag",
      certificateTrack: "picture",
    },
    {
      ...base,
      id: `camera-truefalse-${gradeToKey(grade)}`,
      route: "/student/camera-truefalse",
      subject: "General",
      title: "True or False",
      description: `Decide if statements are true or false by moving the answer into the box with camera hand tracking.`,
      competency: "Critical thinking and factual reasoning",
      coverEmoji: "✅",
      interaction: "camera-drag",
      certificateTrack: "truefalse",
    },
  ];
}
