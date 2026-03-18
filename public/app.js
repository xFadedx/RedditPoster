const state = {
  draft: null,
  jobs: [],
  integrations: {
    reddit: { connected: false },
    twitter: { connected: false }
  }
};

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  draftState: document.getElementById("draftState"),
  flashMessage: document.getElementById("flashMessage"),
  emptyState: document.getElementById("emptyState"),
  contentGrid: document.getElementById("contentGrid"),
  jobsList: document.getElementById("jobsList"),
  deliveryHint: document.getElementById("deliveryHint"),
  redditConnection: document.getElementById("redditConnection"),
  twitterConnection: document.getElementById("twitterConnection"),
  connectRedditBtn: document.getElementById("connectRedditBtn"),
  connectTwitterBtn: document.getElementById("connectTwitterBtn"),
  campaignForm: document.getElementById("campaignForm"),
  saveBtn: document.getElementById("saveBtn"),
  postBtn: document.getElementById("postBtn"),
  requestApprovalBtn: document.getElementById("requestApprovalBtn"),
  approveBtn: document.getElementById("approveBtn"),
  productName: document.getElementById("productName"),
  targetAudience: document.getElementById("targetAudience"),
  description: document.getElementById("description"),
  tone: document.getElementById("tone"),
  delayMs: document.getElementById("delayMs"),
  scheduleAt: document.getElementById("scheduleAt"),
  manualApproval: document.getElementById("manualApproval"),
  redditSubreddit: document.getElementById("redditSubreddit"),
  discordWebhookUrl: document.getElementById("discordWebhookUrl")
};

const contentFields = {
  reddit: document.getElementById("content-reddit"),
  twitter: document.getElementById("content-twitter"),
  discord: document.getElementById("content-discord"),
  seo: document.getElementById("content-seo")
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPlatformLabel(platform) {
  return {
    reddit: "Reddit",
    twitter: "X / Twitter",
    discord: "Discord"
  }[platform] || platform;
}

function formatResultSummary(results = []) {
  if (!Array.isArray(results) || !results.length) {
    return "";
  }

  return results.map((result) => `${formatPlatformLabel(result.platform)}: ${result.status}`).join(" | ");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function setMessage(message, kind = "info") {
  elements.flashMessage.textContent = message;
  elements.flashMessage.dataset.kind = kind;
}

function selectedPlatforms() {
  return [...document.querySelectorAll('.sidebar-panel input[type="checkbox"][value]:checked')].map(
    (input) => input.value
  );
}

function getCampaignPayload() {
  return {
    productName: elements.productName.value.trim(),
    description: elements.description.value.trim(),
    targetAudience: elements.targetAudience.value.trim(),
    tone: elements.tone.value
  };
}

function collectContentPayload() {
  return {
    reddit: contentFields.reddit.value.trim(),
    twitter: contentFields.twitter.value.trim(),
    discord: contentFields.discord.value.trim(),
    seo: contentFields.seo.value.trim()
  };
}

function renderIntegrations() {
  const reddit = state.integrations.reddit || { connected: false };
  const twitter = state.integrations.twitter || { connected: false };

  elements.redditConnection.textContent = reddit.connected
    ? `Connected as u/${reddit.username}`
    : "Not connected";
  elements.twitterConnection.textContent = twitter.connected
    ? `Connected as @${twitter.username}`
    : "Not connected";

  elements.connectRedditBtn.textContent = reddit.connected ? "Reconnect Reddit" : "Connect Reddit";
  elements.connectTwitterBtn.textContent = twitter.connected ? "Reconnect X" : "Connect X";
}

function updateDeliveryHint() {
  const platforms = selectedPlatforms();
  const notes = [];

  elements.postBtn.textContent = elements.manualApproval.checked
    ? "Create approval request"
    : "Post / Schedule now";

  if (elements.manualApproval.checked) {
    notes.push("Manual approval is on, so the main button only stages the request until you approve it.");
  }

  if (platforms.includes("reddit")) {
    if (!state.integrations.reddit?.connected) {
      notes.push("Connect Reddit before posting there.");
    }

    if (!elements.redditSubreddit.value.trim()) {
      notes.push("Choose a subreddit for Reddit posts.");
    }
  }

  if (platforms.includes("twitter") && !state.integrations.twitter?.connected) {
    notes.push("Connect X before posting there.");
  }

  if (platforms.includes("discord") && !elements.discordWebhookUrl.value.trim()) {
    notes.push("Discord needs a webhook URL unless DISCORD_WEBHOOK_URL is set in .env.");
  }

  elements.deliveryHint.textContent = notes.join(" ");
}

function syncFormToDraft(draft) {
  elements.productName.value = draft.productName || "";
  elements.targetAudience.value = draft.targetAudience || "";
  elements.description.value = draft.description || "";
  elements.tone.value = draft.tone || "balanced";

  Object.entries(contentFields).forEach(([platform, field]) => {
    field.value = draft.content?.[platform] || "";
  });
}

function toggleDraftUi(hasDraft) {
  elements.emptyState.classList.toggle("hidden", hasDraft);
  elements.contentGrid.classList.toggle("hidden", !hasDraft);

  [elements.saveBtn, elements.postBtn, elements.requestApprovalBtn].forEach((button) => {
    button.disabled = !hasDraft;
  });

  document.querySelectorAll(".tone-button, [data-copy]").forEach((button) => {
    button.disabled = !hasDraft;
  });
}

function renderDraft() {
  if (!state.draft) {
    toggleDraftUi(false);
    elements.approveBtn.disabled = true;
    elements.draftState.textContent = "No draft loaded";
    updateDeliveryHint();
    return;
  }

  toggleDraftUi(true);
  syncFormToDraft(state.draft);

  const scheduleLabel = state.draft.pendingSubmission?.scheduleAt
    ? `Pending for ${new Date(state.draft.pendingSubmission.scheduleAt).toLocaleString()}`
    : "No pending schedule";

  elements.approveBtn.disabled = !state.draft.pendingSubmission;
  elements.draftState.textContent = `Draft ${state.draft.id.slice(0, 8)} | ${state.draft.approvalStatus} | ${scheduleLabel}`;
  updateDeliveryHint();
}

function renderJobs() {
  if (!state.jobs.length) {
    elements.jobsList.innerHTML = '<li class="job-empty">No jobs yet.</li>';
    return;
  }

  elements.jobsList.innerHTML = state.jobs
    .slice(0, 8)
    .map((job) => {
      const status = escapeHtml(job.status || "unknown");
      const platforms = escapeHtml((job.platforms || []).map(formatPlatformLabel).join(", "));
      const when = job.scheduleAt ? new Date(job.scheduleAt).toLocaleString() : "Immediate";
      const error = job.error ? `<p class="job-error">${escapeHtml(job.error)}</p>` : "";

      return `
        <li class="job-item">
          <div class="job-head">
            <strong>${platforms}</strong>
            <span>${status}</span>
          </div>
          <p class="job-meta">${escapeHtml(when)}</p>
          ${error}
        </li>
      `;
    })
    .join("");
}

async function refreshHealth() {
  try {
    await requestJson("/api/health");
    elements.apiStatus.textContent = "Backend connected";
  } catch (error) {
    elements.apiStatus.textContent = `Backend unavailable: ${error.message}`;
  }
}

async function refreshJobs() {
  try {
    const { jobs } = await requestJson("/api/jobs");
    state.jobs = jobs;
    renderJobs();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function refreshIntegrations() {
  try {
    const { integrations } = await requestJson("/api/integrations");
    state.integrations = integrations;
    renderIntegrations();
    updateDeliveryHint();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function persistDraft(showMessage = true) {
  if (!state.draft) {
    setMessage("Generate a draft first.", "error");
    return null;
  }

  const payload = {
    ...getCampaignPayload(),
    content: collectContentPayload()
  };

  const { draft } = await requestJson(`/api/drafts/${state.draft.id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  state.draft = draft;
  renderDraft();

  if (showMessage) {
    setMessage("Draft saved.", "success");
  }

  return draft;
}

function buildSubmissionPayload(manualApprovalOverride = elements.manualApproval.checked) {
  return {
    platforms: selectedPlatforms(),
    scheduleAt: elements.scheduleAt.value || null,
    delayMs: Number(elements.delayMs.value || 0),
    discordWebhookUrl: elements.discordWebhookUrl.value.trim(),
    redditSubreddit: elements.redditSubreddit.value.trim(),
    manualApproval: manualApprovalOverride
  };
}

function validatePayloadBeforeSubmit(payload) {
  if (!payload.platforms.length) {
    throw new Error("Select at least one platform to publish.");
  }

  if (payload.platforms.includes("reddit")) {
    if (!state.integrations.reddit?.connected) {
      throw new Error("Connect Reddit before posting there.");
    }

    if (!payload.redditSubreddit) {
      throw new Error("Choose a subreddit before posting to Reddit.");
    }
  }

  if (payload.platforms.includes("twitter") && !state.integrations.twitter?.connected) {
    throw new Error("Connect X before posting there.");
  }

  if (payload.platforms.includes("discord") && !payload.discordWebhookUrl) {
    throw new Error("Discord is selected but the webhook field is empty.");
  }
}

async function handleSubmissionResult(result) {
  state.draft = result.draft;
  renderDraft();
  await refreshJobs();

  if (result.mode === "approval_requested") {
    const platforms = (result.draft.pendingSubmission?.platforms || []).map(formatPlatformLabel).join(", ");
    setMessage(
      `Approval requested for ${platforms || "the selected platforms"}. Click Approve pending request when you are ready.`,
      "success"
    );
    return;
  }

  if (result.mode === "scheduled") {
    const scheduleLabel = result.job?.scheduleAt
      ? new Date(result.job.scheduleAt).toLocaleString()
      : "later";
    setMessage(`Scheduled for ${scheduleLabel}.`, "success");
    return;
  }

  if (result.mode === "posted") {
    setMessage(`Posting finished. ${formatResultSummary(result.results)}`, "success");
    return;
  }

  if (result.mode === "approved") {
    setMessage("Draft marked as approved. Use the main button if you still want to send it immediately.", "success");
    return;
  }

  setMessage("Action completed.", "success");
}

async function generateDraft(event) {
  event.preventDefault();

  try {
    const { draft } = await requestJson("/api/generate", {
      method: "POST",
      body: JSON.stringify(getCampaignPayload())
    });

    state.draft = draft;
    renderDraft();
    setMessage("Draft generated.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function rewritePlatform(platform, tone) {
  try {
    await persistDraft(false);
    const { draft } = await requestJson("/api/rewrite", {
      method: "POST",
      body: JSON.stringify({
        draftId: state.draft.id,
        platform,
        tone
      })
    });

    state.draft = draft;
    renderDraft();
    setMessage(`${formatPlatformLabel(platform)} rewritten in ${tone} tone.`, "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function copyPlatform(platform) {
  try {
    await navigator.clipboard.writeText(contentFields[platform].value || "");
    setMessage(`${formatPlatformLabel(platform)} content copied to clipboard.`, "success");
  } catch (error) {
    setMessage(`Copy failed: ${error.message}`, "error");
  }
}

function openAuthWindow(provider) {
  const url = `/api/auth/${provider}/start`;
  const popup = window.open(url, `${provider}Auth`, "width=720,height=820");

  if (!popup) {
    window.location.href = url;
    return;
  }

  setMessage(`Finish connecting ${provider === "reddit" ? "Reddit" : "X"} in the popup window.`, "success");
}

async function postOrSchedule() {
  try {
    await persistDraft(false);
    const payload = buildSubmissionPayload();
    validatePayloadBeforeSubmit(payload);

    const result = await requestJson(`/api/drafts/${state.draft.id}/submit`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    await handleSubmissionResult(result);
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function requestApprovalOnly() {
  try {
    await persistDraft(false);
    const payload = buildSubmissionPayload(true);
    validatePayloadBeforeSubmit(payload);

    const result = await requestJson(`/api/drafts/${state.draft.id}/submit`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    await handleSubmissionResult(result);
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function approveDraft() {
  if (!state.draft?.pendingSubmission) {
    setMessage("There is no pending approval request yet.", "error");
    return;
  }

  try {
    const result = await requestJson(`/api/drafts/${state.draft.id}/approve`, {
      method: "POST",
      body: JSON.stringify({})
    });

    await handleSubmissionResult(result);
  } catch (error) {
    setMessage(error.message, "error");
  }
}

elements.campaignForm.addEventListener("submit", generateDraft);
elements.saveBtn.addEventListener("click", () => {
  persistDraft().catch((error) => setMessage(error.message, "error"));
});
elements.postBtn.addEventListener("click", postOrSchedule);
elements.requestApprovalBtn.addEventListener("click", requestApprovalOnly);
elements.approveBtn.addEventListener("click", approveDraft);
elements.connectRedditBtn.addEventListener("click", () => openAuthWindow("reddit"));
elements.connectTwitterBtn.addEventListener("click", () => openAuthWindow("twitter"));
elements.manualApproval.addEventListener("change", updateDeliveryHint);
elements.discordWebhookUrl.addEventListener("input", updateDeliveryHint);
elements.redditSubreddit.addEventListener("input", updateDeliveryHint);
document.querySelectorAll('.sidebar-panel input[type="checkbox"][value]').forEach((input) => {
  input.addEventListener("change", updateDeliveryHint);
});

document.querySelectorAll(".tone-button").forEach((button) => {
  button.addEventListener("click", () => {
    rewritePlatform(button.dataset.tonePlatform, button.dataset.tone);
  });
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", () => copyPlatform(button.dataset.copy));
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) {
    return;
  }

  if (event.data?.type === "marketing-agent-auth-complete") {
    refreshIntegrations();
    setMessage("Account connected.", "success");
  }
});

window.addEventListener("focus", () => {
  refreshIntegrations();
});

toggleDraftUi(false);
renderJobs();
renderIntegrations();
updateDeliveryHint();
refreshHealth();
refreshJobs();
refreshIntegrations();

