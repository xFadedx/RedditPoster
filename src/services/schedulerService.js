import { listJobRecords } from "./storageService.js";
import { runScheduledJob } from "./draftService.js";

const pollMs = Number(process.env.SCHEDULER_POLL_MS || 15000);
let timer = null;
let isTickRunning = false;

async function processDueJobs() {
  if (isTickRunning) {
    return;
  }

  isTickRunning = true;

  try {
    const jobs = await listJobRecords();
    const now = Date.now();
    const dueJobs = jobs.filter(
      (job) => job.status === "scheduled" && new Date(job.scheduleAt).getTime() <= now
    );

    for (const job of dueJobs) {
      try {
        await runScheduledJob(job.id);
      } catch (error) {
        console.error(`Scheduled job ${job.id} failed:`, error.message);
      }
    }
  } finally {
    isTickRunning = false;
  }
}

export function startScheduler() {
  if (timer) {
    return timer;
  }

  timer = setInterval(processDueJobs, pollMs);
  timer.unref?.();

  processDueJobs().catch((error) => {
    console.error("Initial scheduler tick failed:", error.message);
  });

  return timer;
}
