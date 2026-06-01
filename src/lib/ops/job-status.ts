export type OpsJobStatus = "ok" | "warning" | "critical";

export type JobRunSnapshot = {
  name: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
};

export type JobStatusSummary = {
  status: OpsJobStatus;
  totalJobs: number;
  unhealthyJobs: number;
  staleJobs: string[];
  failingJobs: string[];
};

const STALE_THRESHOLD_HOURS = 36;

function isStale(lastRunAt: string | null, now: Date): boolean {
  if (!lastRunAt) {
    return true;
  }

  const lastRun = new Date(lastRunAt);
  if (Number.isNaN(lastRun.getTime())) {
    return true;
  }

  const ageMs = now.getTime() - lastRun.getTime();
  return ageMs > STALE_THRESHOLD_HOURS * 60 * 60 * 1000;
}

export function summarizeJobHealth(jobs: JobRunSnapshot[], now = new Date()): JobStatusSummary {
  const staleJobs: string[] = [];
  const failingJobs: string[] = [];

  for (const job of jobs) {
    if (isStale(job.lastRunAt, now)) {
      staleJobs.push(job.name);
    }

    if (job.consecutiveFailures >= 3) {
      failingJobs.push(job.name);
    }
  }

  const unhealthyJobs = new Set([...staleJobs, ...failingJobs]).size;
  const status: OpsJobStatus =
    failingJobs.length > 0 ? "critical" : unhealthyJobs > 0 ? "warning" : "ok";

  return {
    status,
    totalJobs: jobs.length,
    unhealthyJobs,
    staleJobs,
    failingJobs,
  };
}
