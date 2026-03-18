import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const draftsFile = path.join(dataDir, "drafts.json");
const jobsFile = path.join(dataDir, "jobs.json");
const writeLocks = new Map();

async function ensureFile(filePath, fallback) {
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, "utf8");
  } catch {
    await writeFile(filePath, JSON.stringify(fallback, null, 2));
  }
}

async function readJson(filePath, fallback) {
  await ensureFile(filePath, fallback);
  const raw = await readFile(filePath, "utf8");

  if (!raw.trim()) {
    return structuredClone(fallback);
  }

  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function queueWrite(filePath, worker) {
  const previous = writeLocks.get(filePath) || Promise.resolve();
  const next = previous.catch(() => undefined).then(worker);
  writeLocks.set(filePath, next);

  try {
    return await next;
  } finally {
    if (writeLocks.get(filePath) === next) {
      writeLocks.delete(filePath);
    }
  }
}

async function updateCollection(filePath, updater) {
  return queueWrite(filePath, async () => {
    const current = await readJson(filePath, []);
    const next = await updater(current);
    await writeJson(filePath, next);
    return next;
  });
}

export async function listDraftRecords() {
  const drafts = await readJson(draftsFile, []);
  return drafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function findDraftRecord(draftId) {
  const drafts = await readJson(draftsFile, []);
  return drafts.find((draft) => draft.id === draftId) || null;
}

export async function insertDraftRecord(draft) {
  await updateCollection(draftsFile, (drafts) => [draft, ...drafts]);
  return draft;
}

export async function updateDraftRecord(draftId, updater) {
  let updatedDraft = null;

  await updateCollection(draftsFile, (drafts) =>
    drafts.map((draft) => {
      if (draft.id !== draftId) {
        return draft;
      }

      updatedDraft = updater(draft);
      return updatedDraft;
    })
  );

  return updatedDraft;
}

export async function listJobRecords() {
  const jobs = await readJson(jobsFile, []);
  return jobs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function insertJobRecord(job) {
  await updateCollection(jobsFile, (jobs) => [job, ...jobs]);
  return job;
}

export async function updateJobRecord(jobId, updater) {
  let updatedJob = null;

  await updateCollection(jobsFile, (jobs) =>
    jobs.map((job) => {
      if (job.id !== jobId) {
        return job;
      }

      updatedJob = updater(job);
      return updatedJob;
    })
  );

  return updatedJob;
}
