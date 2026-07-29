import { prisma } from "@/lib/db";
import { summarizeJobHealth, type JobRunSnapshot } from "@/lib/ops/job-status";
import type { MonitoringStatus } from "./capability-registry";

const TRACKED_JOBS = [
  "tutor-presence-sweep",
  "short-learning-lifecycle",
  "short-learning-reminders",
] as const;

function mapJobSummaryStatus(status: "ok" | "warning" | "critical"): MonitoringStatus {
  if (status === "ok") return "healthy";
  if (status === "warning") return "degraded";
  return "unhealthy";
}

export type JobsReport = {
  status: MonitoringStatus;
  checkedAt: string;
  totalJobs: number;
  unhealthyJobs: number;
  jobs: Array<{
    name: string;
    status: MonitoringStatus;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    consecutiveFailures: number;
  }>;
};

export async function buildJobsReport(): Promise<JobsReport> {
  const snapshots: JobRunSnapshot[] = [];

  for (const jobName of TRACKED_JOBS) {
    try {
      const recent = await prisma.jobRunLog.findMany({
        where: { jobName },
        orderBy: { startedAt: "desc" },
        take: 10,
        select: { status: true, startedAt: true, finishedAt: true },
      });
      const last = recent[0] ?? null;
      let consecutiveFailures = 0;
      for (const row of recent) {
        if (row.status === "failed") consecutiveFailures += 1;
        else break;
      }
      const lastSuccess = recent.find((row) => row.status === "success" || row.status === "ok");
      snapshots.push({
        name: jobName,
        lastRunAt: last ? (last.finishedAt ?? last.startedAt).toISOString() : null,
        lastSuccessAt: lastSuccess
          ? (lastSuccess.finishedAt ?? lastSuccess.startedAt).toISOString()
          : null,
        consecutiveFailures,
      });
    } catch {
      snapshots.push({
        name: jobName,
        lastRunAt: null,
        lastSuccessAt: null,
        consecutiveFailures: 0,
      });
    }
  }

  const summary = summarizeJobHealth(snapshots);
  return {
    status: mapJobSummaryStatus(summary.status),
    checkedAt: new Date().toISOString(),
    totalJobs: summary.totalJobs,
    unhealthyJobs: summary.unhealthyJobs,
    jobs: snapshots.map((snapshot) => ({
      name: snapshot.name,
      status:
        snapshot.consecutiveFailures >= 3
          ? "unhealthy"
          : snapshot.lastRunAt
            ? "healthy"
            : "unknown",
      lastRunAt: snapshot.lastRunAt,
      lastSuccessAt: snapshot.lastSuccessAt,
      consecutiveFailures: snapshot.consecutiveFailures,
    })),
  };
}
