import { getDb } from './db';
import { processOrderJob } from './order-queue';

let runnerStarted = false;
let runnerTimer: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 30_000; // 30 seconds

async function pollJobs() {
  try {
    const db = getDb();
    const jobs = db.prepare(`
      SELECT * FROM order_jobs
      WHERE status = 'pending' AND next_attempt_at <= datetime('now')
      ORDER BY created_at ASC
      LIMIT 5
    `).all();

    for (const job of jobs) {
      try {
        await processOrderJob(db, job);
      } catch (err) {
        console.error(`[JobRunner] Unexpected error processing job ${(job as any).id}:`, err);
      }
    }
  } catch (err) {
    console.error('[JobRunner] Poll error:', err);
  }
}

export function ensureJobRunnerStarted() {
  if (runnerStarted) return;
  runnerStarted = true;
  console.log('[JobRunner] Started (polling every 30s)');
  runnerTimer = setInterval(pollJobs, POLL_INTERVAL_MS);
  // Run once immediately after a short delay
  setTimeout(pollJobs, 5000);
}

export function stopJobRunner() {
  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
    runnerStarted = false;
  }
}
