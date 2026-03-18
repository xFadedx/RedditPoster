const toneProfiles = {
  hype: {
    opener: "Big update",
    voice: "bold",
    closing: "If this sounds useful, jump in early and tell us what would make it even better.",
    threadHook: "Most product launches die because the message is fuzzy."
  },
  chill: {
    opener: "Quick update",
    voice: "relaxed",
    closing: "If it looks helpful, give it a spin and send honest feedback.",
    threadHook: "A lot of product launches feel harder than they should."
  },
  professional: {
    opener: "Product update",
    voice: "credible",
    closing: "If this aligns with your workflow, I would value thoughtful feedback.",
    threadHook: "Clear positioning and repeatable messaging are usually what separate a strong launch from a forgettable one."
  },
  balanced: {
    opener: "Launch update",
    voice: "clear",
    closing: "If this solves a real problem for you, I would love to hear what you think.",
    threadHook: "Shipping the product is only half the job. Explaining it well is the other half."
  }
};

function pickToneProfile(tone = "balanced") {
  return toneProfiles[tone] || toneProfiles.balanced;
}

function compact(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function sentenceCase(text) {
  const cleaned = compact(text);
  if (!cleaned) {
    return "";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function buildSummary({ productName, description, targetAudience, tone }) {
  const profile = pickToneProfile(tone);
  const audience = compact(targetAudience);
  const problemStatement = compact(description);

  return {
    profile,
    audience,
    problemStatement,
    intro: `${productName} is for ${audience} who need to ${problemStatement.toLowerCase()}.`,
    value: sentenceCase(problemStatement),
    title: `Built ${productName} for ${audience} and would love feedback`
  };
}

function createRedditPost(input) {
  const summary = buildSummary(input);

  return [
    `Title: ${summary.title}`,
    "",
    `${summary.profile.opener}: I have been building ${input.productName} for ${summary.audience}. ${summary.intro}`,
    "",
    `${summary.value} has been the core idea from day one, and I am trying to make the product feel useful without adding unnecessary friction.`,
    "",
    `Right now I am mainly looking for feedback on:`,
    `- whether this problem feels real for ${summary.audience}`,
    `- whether the positioning is clear enough`,
    `- what would make you try a product like this`,
    "",
    summary.profile.closing
  ].join("\n");
}

function createTwitterThread(input) {
  const summary = buildSummary(input);

  return [
    `1/ ${summary.profile.threadHook}`,
    `2/ I am building ${input.productName} for ${summary.audience}.`,
    `3/ The idea is simple: ${summary.problemStatement}.`,
    `4/ I want the product to feel ${summary.profile.voice}, useful, and easy to understand from the first glance.`,
    `5/ ${summary.profile.closing}`
  ].join("\n\n");
}

function createDiscordAnnouncement(input) {
  const summary = buildSummary(input);

  return [
    `**${input.productName} update**`,
    "",
    `${input.productName} is built for ${summary.audience}.`,
    `${summary.value}.`,
    "",
    `I am refining the launch message right now, so I would love feedback on what stands out and what still feels unclear.`,
    "",
    summary.profile.closing
  ].join("\n");
}

function createSeoDescription(input) {
  const summary = buildSummary(input);
  return `${input.productName} helps ${summary.audience} ${summary.problemStatement.toLowerCase()}.`.slice(0, 158);
}

export function generateMarketingBundle(input) {
  return {
    reddit: createRedditPost(input),
    twitter: createTwitterThread(input),
    discord: createDiscordAnnouncement(input),
    seo: createSeoDescription(input)
  };
}

function rewriteText(content, tone, platform) {
  const profile = pickToneProfile(tone);
  const cleaned = compact(content);

  if (!cleaned) {
    return "";
  }

  if (platform === "seo") {
    return cleaned.slice(0, 158);
  }

  if (platform === "twitter") {
    return cleaned
      .split(/\n+/)
      .filter(Boolean)
      .map((line, index) => {
        if (index === 0) {
          return `${line} ${profile.threadHook}`;
        }

        if (index === 4) {
          return `${line} ${profile.closing}`;
        }

        return line;
      })
      .join("\n\n");
  }

  return `${cleaned}\n\n${profile.closing}`;
}

export function rewriteContent(content, tone, platform = "all") {
  if (platform === "all") {
    return Object.fromEntries(
      Object.entries(content).map(([key, value]) => [key, rewriteText(value, tone, key)])
    );
  }

  return rewriteText(content, tone, platform);
}
