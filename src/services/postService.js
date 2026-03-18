import { postDiscordMessage } from "../providers/discordProvider.js";
import { postRedditMessage } from "../providers/redditProvider.js";
import { postTwitterThread } from "../providers/twitterProvider.js";
import { createHttpError, normalizePlatforms } from "../utils/validation.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postToPlatform(platform, payload) {
  if (platform === "discord") {
    return postDiscordMessage(payload);
  }

  if (platform === "reddit") {
    return postRedditMessage(payload);
  }

  if (platform === "twitter") {
    return postTwitterThread(payload);
  }

  throw createHttpError(400, `Unsupported platform "${platform}".`);
}

export async function publishDraft({ draft, platforms, delayMs, destinationConfig = {} }) {
  const selectedPlatforms = normalizePlatforms(platforms);
  const results = [];

  for (const [index, platform] of selectedPlatforms.entries()) {
    const content = draft.content[platform];

    if (!content) {
      throw createHttpError(400, `Draft content for ${platform} is empty.`);
    }

    const result = await postToPlatform(platform, {
      content,
      webhookUrl: destinationConfig.discordWebhookUrl,
      subreddit: destinationConfig.redditSubreddit
    });

    results.push(result);

    if (index < selectedPlatforms.length - 1 && delayMs > 0) {
      await wait(delayMs);
    }
  }

  return {
    postedAt: new Date().toISOString(),
    results
  };
}
