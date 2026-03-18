import { getRedditAccessToken } from "../services/authService.js";
import { createHttpError } from "../utils/validation.js";

const REDDIT_API_BASE_URL = "https://oauth.reddit.com";

function getUserAgent() {
  return process.env.REDDIT_USER_AGENT || "marketing-agent/1.0";
}

function normalizeSubreddit(value) {
  const cleaned = String(value || "").trim().replace(/^r\//i, "");

  if (!cleaned) {
    throw createHttpError(400, "Choose a subreddit before posting to Reddit.");
  }

  return cleaned;
}

function parseRedditPost(content) {
  const lines = String(content || "").split(/\r?\n/);
  const firstTextIndex = lines.findIndex((line) => line.trim());
  const firstLine = firstTextIndex >= 0 ? lines[firstTextIndex].trim() : "";
  const hasExplicitTitle = /^title:/i.test(firstLine);
  const title = (hasExplicitTitle ? firstLine.replace(/^title:\s*/i, "") : firstLine).trim().slice(0, 300);
  const body = (hasExplicitTitle ? lines.slice(firstTextIndex + 1) : lines.slice(firstTextIndex + 1)).join("\n").trim();

  if (!title) {
    throw createHttpError(400, "Reddit content needs a title line.");
  }

  return {
    title,
    text: body
  };
}

export async function postRedditMessage({ content, subreddit }) {
  const accessToken = await getRedditAccessToken();
  const targetSubreddit = normalizeSubreddit(subreddit);
  const post = parseRedditPost(content);
  const body = new URLSearchParams({
    api_type: "json",
    kind: "self",
    sr: targetSubreddit,
    title: post.title,
    text: post.text,
    resubmit: "true",
    sendreplies: "false"
  });

  const response = await fetch(`${REDDIT_API_BASE_URL}/api/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": getUserAgent()
    },
    body
  });

  const payload = await response.json().catch(() => ({}));
  const errors = payload?.json?.errors || [];

  if (!response.ok || errors.length) {
    const message = errors.length
      ? errors.map((entry) => entry.join(": ")).join(", ")
      : JSON.stringify(payload);
    throw createHttpError(502, `Reddit post failed: ${message}`);
  }

  return {
    platform: "reddit",
    status: "sent",
    message: `Posted to r/${targetSubreddit}.`,
    url: payload?.json?.data?.url || null
  };
}
