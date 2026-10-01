/** One publication policy for cards and full content. Dates are epoch milliseconds. */
export function isContentAvailable(content, now = Date.now()) {
  if (!content || !["published", "scheduled"].includes(content.status)) return false;
  const start = Number(content.publishAt || 0);
  const end = Number(content.expiresAt || 0);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (content.status === "scheduled" && !start) return false;
  return (!start || start <= now) && (!end || now < end);
}

export function normalizePublication(input, now = Date.now()) {
  const status = input.status || "draft";
  if (!["draft", "published", "scheduled", "archived"].includes(status)) throw new Error("Choose a valid publication status.");
  const start = input.publishAt ? Number(input.publishAt) : null;
  const end = input.expiresAt ? Number(input.expiresAt) : null;
  if ((start !== null && (!Number.isFinite(start) || start <= 0)) || (end !== null && (!Number.isFinite(end) || end <= 0))) {
    throw new Error("Choose valid publication and expiration dates.");
  }
  if (status === "scheduled" && !start) throw new Error("Select a publication date and time before scheduling.");
  // Keep the existing record shape: approved scheduled records have status
  // 'published'. Client access/listing also checks publishAt; deployed rules must
  // enforce the same time restriction independently. No client cron is required.
  const publishAt = status === "published" ? null : start;
  if (end && ["published", "scheduled"].includes(status) && end <= (publishAt || now)) {
    throw new Error("Expiration must be later than the publication time and the current time.");
  }
  return { status: status === "scheduled" ? "published" : status, publishAt, expiresAt: end };
}

export function publicationLabel(content, now = Date.now()) {
  if (content?.status === "archived") return "Archived";
  if (!["published", "scheduled"].includes(content?.status)) return "Draft";
  if (Number(content.expiresAt || 0) && Number(content.expiresAt) <= now) return "Expired";
  if (Number(content.publishAt || 0) > now || content.status === "scheduled" && !content.publishAt) return "Scheduled";
  return "Published";
}

export function toLocalDateTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
