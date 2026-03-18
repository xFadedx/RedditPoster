import { randomUUID } from "node:crypto";

import { generateMarketingBundle, rewriteContent } from "./contentService.js";
import { publishDraft } from "./postService.js";
import {
  findDraftRecord,
  insertDraftRecord,
  insertJobRecord,
  listDraftRecords,
  listJobRecords,
  updateDraftRecord,
  updateJobRecord
} from "./storageService.js";
import {
  createHttpError,
  ensureRewritePlatform,
  normalizeDelayMs,
  normalizePlatforms,
  normalizeScheduleAt,
  normalizeSubreddit,
  sanitizeContent,
  sanitizeDraftUpdate
} from "../utils/validation.js";

function stamp() {
  return new Date().toISOString();
}

function isFutureSchedule(scheduleAt) {
  return Boolean(scheduleAt) && new Date(scheduleAt).getTime() > Date.now();
}

function buildHistoryEntry(source, dispatchResult, submission) {
  return {
    id: randomUUID(),
    source,
    postedAt: dispatchResult.postedAt,
    platforms: submission.platforms,
    delayMs: submission.delayMs,
    scheduleAt: submission.scheduleAt,
    destinationConfig: submission.destinationConfig,
    results: dispatchResult.results
  };
}

function normalizeSubmission(body = {}) {
  const platforms = normalizePlatforms(body.platforms);
  const redditSubreddit = normalizeSubreddit(body.redditSubreddit);

  if (platforms.includes("reddit") && !redditSubreddit) {
    throw createHttpError(400, "Choose a subreddit before posting to Reddit.");
  }

  return {
    manualApproval: body.manualApproval === true,
    platforms,
    scheduleAt: normalizeScheduleAt(body.scheduleAt),
    delayMs: normalizeDelayMs(body.delayMs),
    destinationConfig: {
      discordWebhookUrl: String(body.discordWebhookUrl || "").trim() || undefined,
      redditSubreddit
    }
  };
}

function ensureDraft(draft, draftId) {
  if (!draft) {
    throw createHttpError(404, `Draft "${draftId}" was not found.`);
  }

  return draft;
}

async function clearPendingSubmission(draftId) {
  return updateDraftRecord(draftId, (draft) => ({
    ...draft,
    approvalStatus: "approved",
    pendingSubmission: null,
    updatedAt: stamp()
  }));
}

async function recordDraftDispatch(draft, submission, dispatchResult, source) {
  return updateDraftRecord(draft.id, (current) => ({
    ...current,
    approvalStatus: "approved",
    pendingSubmission: null,
    lastPostedAt: dispatchResult.postedAt,
    postHistory: [buildHistoryEntry(source, dispatchResult, submission), ...(current.postHistory || [])],
    updatedAt: stamp()
  }));
}

async function scheduleDraft(draft, submission) {
  const job = {
    id: randomUUID(),
    draftId: draft.id,
    platforms: submission.platforms,
    scheduleAt: submission.scheduleAt,
    delayMs: submission.delayMs,
    destinationConfig: submission.destinationConfig,
    status: "scheduled",
    createdAt: stamp(),
    updatedAt: stamp(),
    results: []
  };

  await insertJobRecord(job);
  const updatedDraft = await clearPendingSubmission(draft.id);

  return {
    mode: "scheduled",
    draft: updatedDraft,
    job
  };
}

async function postDraftNow(draft, submission, source) {
  const dispatchResult = await publishDraft({
    draft,
    platforms: submission.platforms,
    delayMs: submission.delayMs,
    destinationConfig: submission.destinationConfig
  });

  const updatedDraft = await recordDraftDispatch(draft, submission, dispatchResult, source);

  return {
    mode: "posted",
    draft: updatedDraft,
    results: dispatchResult.results,
    postedAt: dispatchResult.postedAt
  };
}

async function dispatchSubmission(draft, submission, source) {
  if (isFutureSchedule(submission.scheduleAt)) {
    return scheduleDraft(draft, submission);
  }

  return postDraftNow(draft, submission, source);
}

export async function createGeneratedDraft(campaign) {
  const now = stamp();
  const draft = {
    id: randomUUID(),
    ...campaign,
    content: generateMarketingBundle(campaign),
    approvalStatus: "not_requested",
    pendingSubmission: null,
    lastPostedAt: null,
    postHistory: [],
    createdAt: now,
    updatedAt: now
  };

  await insertDraftRecord(draft);
  return draft;
}

export async function listDrafts() {
  return listDraftRecords();
}

export async function getDraftById(draftId) {
  return ensureDraft(await findDraftRecord(draftId), draftId);
}

export async function updateDraft(draftId, updates) {
  const safeUpdates = sanitizeDraftUpdate(updates);
  const updatedDraft = await updateDraftRecord(draftId, (draft) => ({
    ...draft,
    ...safeUpdates,
    content: safeUpdates.content ? sanitizeContent(safeUpdates.content) : draft.content,
    updatedAt: stamp()
  }));

  return ensureDraft(updatedDraft, draftId);
}

export async function rewriteDraftContent({ draftId, platform = "all", tone }) {
  const draft = await getDraftById(draftId);
  ensureRewritePlatform(platform, draft.content);

  const nextContent =
    platform === "all"
      ? rewriteContent(draft.content, tone, "all")
      : {
          ...draft.content,
          [platform]: rewriteContent(draft.content[platform], tone, platform)
        };

  const updatedDraft = await updateDraftRecord(draftId, (current) => ({
    ...current,
    tone,
    content: nextContent,
    updatedAt: stamp()
  }));

  return ensureDraft(updatedDraft, draftId);
}

export function rewriteStandaloneContent({ content, platform = "all", tone }) {
  if (platform === "all" && (typeof content !== "object" || Array.isArray(content))) {
    throw createHttpError(400, "Standalone rewrite for all platforms requires a content object.");
  }

  return rewriteContent(content, tone, platform);
}

export async function submitDraft({ draftId, ...body }) {
  const draft = await getDraftById(draftId);
  const submission = normalizeSubmission(body);

  if (submission.manualApproval && draft.approvalStatus !== "approved") {
    const updatedDraft = await updateDraftRecord(draftId, (current) => ({
      ...current,
      approvalStatus: "awaiting_approval",
      pendingSubmission: submission,
      updatedAt: stamp()
    }));

    return {
      mode: "approval_requested",
      draft: ensureDraft(updatedDraft, draftId)
    };
  }

  return dispatchSubmission(draft, submission, "direct");
}

export async function approveDraftSubmission(draftId) {
  const draft = await getDraftById(draftId);

  if (!draft.pendingSubmission) {
    const updatedDraft = await updateDraftRecord(draftId, (current) => ({
      ...current,
      approvalStatus: "approved",
      updatedAt: stamp()
    }));

    return {
      mode: "approved",
      draft: ensureDraft(updatedDraft, draftId)
    };
  }

  const approvedDraft = await updateDraftRecord(draftId, (current) => ({
    ...current,
    approvalStatus: "approved",
    updatedAt: stamp()
  }));

  return dispatchSubmission(ensureDraft(approvedDraft, draftId), draft.pendingSubmission, "approval");
}

export async function listJobs() {
  return listJobRecords();
}

export async function runScheduledJob(jobId) {
  const jobs = await listJobRecords();
  const job = jobs.find((currentJob) => currentJob.id === jobId);

  if (!job) {
    return null;
  }

  await updateJobRecord(jobId, (current) => ({
    ...current,
    status: "processing",
    updatedAt: stamp()
  }));

  try {
    const draft = await getDraftById(job.draftId);
    const dispatchResult = await publishDraft({
      draft,
      platforms: job.platforms,
      delayMs: job.delayMs,
      destinationConfig: job.destinationConfig
    });

    const updatedDraft = await recordDraftDispatch(
      draft,
      {
        platforms: job.platforms,
        delayMs: job.delayMs,
        scheduleAt: job.scheduleAt,
        destinationConfig: job.destinationConfig
      },
      dispatchResult,
      "scheduler"
    );

    const updatedJob = await updateJobRecord(jobId, (current) => ({
      ...current,
      status: "posted",
      results: dispatchResult.results,
      postedAt: dispatchResult.postedAt,
      updatedAt: stamp()
    }));

    return {
      job: updatedJob,
      draft: updatedDraft
    };
  } catch (error) {
    await updateJobRecord(jobId, (current) => ({
      ...current,
      status: "failed",
      error: error.message,
      updatedAt: stamp()
    }));

    throw error;
  }
}
