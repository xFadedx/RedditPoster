const allowedPlatforms = ["reddit", "twitter", "discord"];
const allowedToneValues = ["hype", "chill", "professional", "balanced"];

export function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireText(value, label) {
  if (!String(value || "").trim()) {
    throw createHttpError(400, `${label} is required.`);
  }

  return String(value).trim();
}

export function validateCampaignInput(body = {}) {
  const tone = String(body.tone || "balanced").trim().toLowerCase();

  if (!allowedToneValues.includes(tone)) {
    throw createHttpError(400, `Tone must be one of: ${allowedToneValues.join(", ")}.`);
  }

  return {
    productName: requireText(body.productName, "Product name"),
    description: requireText(body.description, "Description"),
    targetAudience: requireText(body.targetAudience, "Target audience"),
    tone
  };
}

export function sanitizeContent(content = {}) {
  return {
    reddit: String(content.reddit || "").trim(),
    twitter: String(content.twitter || "").trim(),
    discord: String(content.discord || "").trim(),
    seo: String(content.seo || "").trim()
  };
}

export function normalizePlatforms(platforms) {
  const raw = Array.isArray(platforms) ? platforms : [];
  const unique = [...new Set(raw.map((value) => String(value).toLowerCase().trim()))];
  const filtered = unique.filter((platform) => allowedPlatforms.includes(platform));

  if (!filtered.length) {
    throw createHttpError(400, "Select at least one posting platform.");
  }

  return filtered;
}

export function normalizeDelayMs(value) {
  const delayMs = Number(value ?? process.env.POST_DELAY_MS ?? 2500);

  if (Number.isNaN(delayMs) || delayMs < 0) {
    throw createHttpError(400, "Delay between posts must be 0 or greater.");
  }

  return delayMs;
}

export function normalizeScheduleAt(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, "Schedule time is invalid.");
  }

  return parsed.toISOString();
}

export function normalizeSubreddit(value) {
  const cleaned = String(value || "").trim().replace(/^r\//i, "");

  if (!cleaned) {
    return undefined;
  }

  if (!/^[A-Za-z0-9_]{2,21}$/.test(cleaned)) {
    throw createHttpError(400, "Subreddit names should be 2-21 characters using letters, numbers, or underscores.");
  }

  return cleaned;
}

export function sanitizeDraftUpdate(body = {}) {
  const update = {};

  if (body.productName !== undefined) {
    update.productName = requireText(body.productName, "Product name");
  }

  if (body.description !== undefined) {
    update.description = requireText(body.description, "Description");
  }

  if (body.targetAudience !== undefined) {
    update.targetAudience = requireText(body.targetAudience, "Target audience");
  }

  if (body.tone !== undefined) {
    const tone = String(body.tone).trim().toLowerCase();

    if (!allowedToneValues.includes(tone)) {
      throw createHttpError(400, `Tone must be one of: ${allowedToneValues.join(", ")}.`);
    }

    update.tone = tone;
  }

  if (body.content !== undefined) {
    update.content = sanitizeContent(body.content);
  }

  return update;
}

export function ensureRewritePlatform(platform, content) {
  if (platform === "all") {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(content, platform)) {
    throw createHttpError(400, `Unsupported rewrite platform "${platform}".`);
  }
}
