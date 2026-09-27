
// Replace the discussion normalization inside normalizeLesson()

const rawDiscussion =
  raw.discussion ||
  raw.content ||
  raw.description ||
  "";

const discussion = Array.isArray(rawDiscussion)
  ? rawDiscussion
  : String(rawDiscussion)
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n/)
      .map((item) => item.trim())
      .filter(Boolean);
