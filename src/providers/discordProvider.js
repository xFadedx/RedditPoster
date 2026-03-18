export async function postDiscordMessage({ content, webhookUrl }) {
  const resolvedWebhook = webhookUrl || process.env.DISCORD_WEBHOOK_URL;

  if (!resolvedWebhook) {
    throw new Error("Discord webhook URL is missing. Provide it in the dashboard or .env.");
  }

  const response = await fetch(resolvedWebhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content,
      username: "Marketing Automation Bot"
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Discord webhook failed with ${response.status}: ${details.slice(0, 250)}`);
  }

  return {
    platform: "discord",
    status: "sent",
    message: "Posted to Discord webhook."
  };
}
