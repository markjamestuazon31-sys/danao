export function progressRecordFor(item, progress) {
  return item.type === "game"
    ? progress.game?.[item.id] || {}
    : progress.lesson?.[item.id] || {};
}

export function itemProgressPercent(item, progress) {
  const record = progressRecordFor(item, progress);
  if (item.type === "game") {
    const stars = Number(record.bestStars || record.stars || 0);
    return record.lastPlayedAt ? (stars >= 3 ? 100 : Math.max(20, stars * 33)) : 0;
  }
  return Math.max(0, Math.min(100, Number(record.percent || 0)));
}

export function recommendCatalog(catalog, progress, type, limit = 3) {
  return catalog
    .filter((item) => item.type === type)
    .map((item) => ({
      item,
      percent: itemProgressPercent(item, progress),
      updatedAt: Number(progressRecordFor(item, progress).updatedAt || 0),
    }))
    .sort((a, b) => {
      const aFinished = a.percent >= 100 ? 1 : 0;
      const bFinished = b.percent >= 100 ? 1 : 0;
      if (aFinished !== bFinished) return aFinished - bFinished;
      if (a.percent !== b.percent) return b.percent - a.percent;
      if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
      const systemDifference = Number(a.item.source === "system") - Number(b.item.source === "system");
      if (systemDifference) return systemDifference;
      return Number(b.item.updatedAt || b.item.createdAt || 0) - Number(a.item.updatedAt || a.item.createdAt || 0);
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

export function continueItem(catalog, progress) {
  const startedLesson = catalog
    .filter((item) => item.type === "lesson")
    .map((item) => ({ item, percent: itemProgressPercent(item, progress) }))
    .filter(({ percent }) => percent > 0 && percent < 100)
    .sort((a, b) => b.percent - a.percent)[0];
  return startedLesson?.item || catalog.find((item) => item.type === "lesson") || catalog[0] || null;
}

export function buildSubjectProgress(catalog, progress) {
  const bySubject = new Map();
  catalog.forEach((item) => {
    const subject = item.subject || "General";
    const row = bySubject.get(subject) || {
      subject,
      total: 0,
      completed: 0,
      progressTotal: 0,
    };
    const percent = itemProgressPercent(item, progress);
    row.total += 1;
    row.progressTotal += percent;
    if (percent >= 100) row.completed += 1;
    bySubject.set(subject, row);
  });
  return [...bySubject.values()]
    .map((row) => ({
      ...row,
      percent: row.total ? Math.round(row.progressTotal / row.total) : 0,
    }))
    .sort((a, b) => b.percent - a.percent || a.subject.localeCompare(b.subject));
}

function activityStatus(event) {
  if (event.status) return String(event.status);
  if (event.eventType === "lesson_started") return "Started lesson";
  if (event.eventType === "lesson_quiz") return `Quiz ${Number(event.score || 0)}%`;
  if (event.eventType === "lesson_completed") return "Lesson completed";
  if (event.eventType === "game_completed") {
    return `Score ${Number(event.score || 0)} • ${Number(event.stars || 0)} stars`;
  }
  return "Learning activity";
}

function eventActivities(progress) {
  return Object.entries(progress.activity || {})
    .map(([eventId, event]) => ({
      eventId,
      id: event.contentId,
      type: event.contentType === "game" ? "game" : event.contentType === "quiz" ? "quiz" : "lesson",
      eventType: event.eventType || "activity",
      title: event.title || (event.contentType === "game" ? "Learning game" : "Learning lesson"),
      subject: event.subject || "General",
      timestamp: Number(event.timestamp || 0),
      status: activityStatus(event),
      score: Number(event.score || 0),
      xpEarned: Number(event.xpEarned || 0),
    }))
    .filter((item) => item.id && item.timestamp);
}

function legacyActivities(progress, excludedContent = new Set()) {
  const lessons = Object.entries(progress.lesson || {})
    .filter(([id]) => !excludedContent.has(`lesson:${id}`))
    .map(([id, record]) => ({
      eventId: `legacy-lesson-${id}`,
      id,
      type: "lesson",
      eventType: record.completed ? "lesson_completed" : "lesson_started",
      title: record.title || "Learning lesson",
      subject: record.subject || "General",
      timestamp: Number(record.completedAt || record.updatedAt || record.startedAt || 0),
      status: record.completed ? "Lesson completed" : `${Number(record.percent || 0)}% complete`,
      score: Number(record.bestQuizScore || record.quizScore || 0),
      xpEarned: Number(record.xpEarned || 0),
    }));

  const games = Object.entries(progress.game || {})
    .filter(([id]) => !excludedContent.has(`game:${id}`))
    .map(([id, record]) => ({
      eventId: `legacy-game-${id}`,
      id,
      type: "game",
      eventType: "game_completed",
      title: record.title || "Learning game",
      subject: record.subject || "General",
      timestamp: Number(record.lastPlayedAt || record.updatedAt || 0),
      status: `Best score ${Number(record.bestScore || record.score || 0)}`,
      score: Number(record.bestScore || record.score || 0),
      xpEarned: Number(record.xpEarned || 0),
    }));

  return [...lessons, ...games].filter((item) => item.timestamp);
}

export function getRecentActivities(progress) {
  const events = eventActivities(progress);
  const eventContent = new Set(events.map((item) => `${item.type}:${item.id}`));
  return [...events, ...legacyActivities(progress, eventContent)]
    .sort((a, b) => b.timestamp - a.timestamp);
}

function isSameLocalDate(timestamp, targetDate) {
  const date = new Date(Number(timestamp || 0));
  return date.getFullYear() === targetDate.getFullYear()
    && date.getMonth() === targetDate.getMonth()
    && date.getDate() === targetDate.getDate();
}

export function countCompletedActivitiesOnDate(progress, targetDate = new Date()) {
  return getRecentActivities(progress).filter(
    (item) => (
      item.eventType === "lesson_completed"
      || item.eventType === "game_completed"
      || item.eventType === "standalone_quiz"
    ) && isSameLocalDate(item.timestamp, targetDate),
  ).length;
}

export function formatRelativeTime(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "Recently";
  const seconds = Math.max(1, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}

export function learningHref(item) {
  const explicitRoute = String(item?.route || "").trim();
  if (explicitRoute.startsWith("/")) return explicitRoute;

  const id = String(item?.id || item?.contentId || "");
  if (id.startsWith("camera-math-grade-")) {
    return "/student/camera-math";
  }
  if (id.startsWith("camera-reading-english-")) {
    return "/student/camera-reading-english";
  }
  if (id.startsWith("camera-reading-filipino-") || ["math-adventure", "science-sort"].includes(id)) {
    return "/student/games";
  }
  return `/${item?.type === "game" || item?.contentType === "game" ? "game" : "lesson"}/${id}`;
}

export function activityHref(activity) {
  if (activity?.type === "quiz" || activity?.contentType === "quiz") {
    return `/student/quizzes/${activity?.id || activity?.contentId || ""}`;
  }
  return learningHref(activity);
}
