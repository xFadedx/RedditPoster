import { getTwitterAccessToken } from "../services/authService.js";
import { createHttpError } from "../utils/validation.js";

const TWITTER_API_BASE_URL = "https://api.x.com/2";

function splitThread(content) {
  const raw = String(content || "").trim();

  if (!raw) {
    throw createHttpError(400, "X content is empty.");
  }

  const segments = raw
    .split(/\n\s*\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length ? segments : [raw];
}

async function createTweet(accessToken, text, replyToId) {
  if (text.length > 280) {
    throw createHttpError(400, `One X post is ${text.length} characters long. Keep each post at 280 characters or fewer.`);
  }

  const response = await fetch(`${TWITTER_API_BASE_URL}/tweets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(
      replyToId
        ? {
            text,
            reply: {
              in_reply_to_tweet_id: replyToId
            }
          }
        : { text }
    )
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.errors?.length) {
    const detail = payload?.detail || payload?.title || JSON.stringify(payload);
    throw createHttpError(502, `X post failed: ${detail}`);
  }

  return payload?.data?.id;
}

export async function postTwitterThread({ content }) {
  const accessToken = await getTwitterAccessToken();
  const segments = splitThread(content);
  const ids = [];
  let replyToId = null;

  for (const segment of segments) {
    const id = await createTweet(accessToken, segment, replyToId);
    ids.push(id);
    replyToId = id;
  }

  return {
    platform: "twitter",
    status: "sent",
    message: ids.length > 1 ? `Posted a ${ids.length}-post thread to X.` : "Posted to X.",
    ids
  };
}
