import { summarizeJobHealth, type JobRunSnapshot } from "@/lib/ops/job-status";
import { summarizeWebhookFailures, type WebhookFailureEvent } from "@/lib/ops/webhook-failures";

export type SafeHealthReport = {
  ok: boolean;
  environment: string;
  timestamp: string;
  version: string;
  checks: {
    database: "ok" | "unknown";
    jobs: ReturnType<typeof summarizeJobHealth>;
    webhooks: ReturnType<typeof summarizeWebhookFailures>;
  };
};

export type HealthInput = {
  environment?: string;
  version?: string;
  databaseConnected?: boolean;
  jobs?: JobRunSnapshot[];
  webhookFailures?: WebhookFailureEvent[];
};

export function buildSafeHealthReport(input: HealthInput = {}): SafeHealthReport {
  const jobs = summarizeJobHealth(input.jobs ?? []);
  const webhooks = summarizeWebhookFailures(input.webhookFailures ?? []);
  const database = input.databaseConnected ? "ok" : "unknown";

  const ok = jobs.status === "ok" && webhooks.status === "ok";

  return {
    ok,
    environment: input.environment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
    version: input.version ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    checks: {
      database,
      jobs,
      webhooks,
    },
  };
}
