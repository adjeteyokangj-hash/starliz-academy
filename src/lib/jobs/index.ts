import { withJobLock } from "./lock";
import { failJobLog, finishJobLog, startJobLog } from "./logger";
import { runAiUsageRollup } from "./ai-usage-rollup";
import { runCleanupAiDrafts } from "./cleanup-ai-drafts";
import { runNotificationDigest } from "./notification-digest";
import { runReportSnapshots } from "./report-snapshots";
import { runSubscriptionChecks } from "./subscription-checks";
import { runSchoolProvisioningJobs } from "./school-provisioning";
import { runSchoolNotificationDispatch } from "./school-notification-dispatch";

const jobs = [
  { name: "subscription-checks", run: runSubscriptionChecks },
  { name: "report-snapshots", run: runReportSnapshots },
  { name: "ai-usage-rollup", run: runAiUsageRollup },
  { name: "cleanup-ai-drafts", run: runCleanupAiDrafts },
  { name: "notification-digest", run: runNotificationDigest },
  { name: "school-provisioning", run: runSchoolProvisioningJobs },
  { name: "school-notification-dispatch", run: runSchoolNotificationDispatch },
];

export async function runDailyJobs() {
  return withJobLock("daily-jobs", async () => {
    const results = [];
    for (const job of jobs) {
      const log = await startJobLog(job.name);
      try {
        const metadata = await job.run();
        await finishJobLog(log.id, metadata);
        results.push({ jobName: job.name, status: "success", metadata });
      } catch (error) {
        await failJobLog(log.id, error);
        results.push({ jobName: job.name, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  });
}
