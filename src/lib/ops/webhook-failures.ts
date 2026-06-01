export type WebhookFailureEvent = {
  provider: string;
  statusCode: number;
  endpoint: string;
  occurredAt: string;
  customerEmail?: string | null;
  childId?: string | null;
};

export type WebhookFailureSummary = {
  totalFailures: number;
  recentFailures: number;
  providers: string[];
  latestFailureAt: string | null;
  status: "ok" | "warning" | "critical";
};

const CRITICAL_THRESHOLD = 10;
const WARNING_THRESHOLD = 1;

export function summarizeWebhookFailures(
  events: WebhookFailureEvent[],
  now = new Date(),
  lookbackHours = 24,
): WebhookFailureSummary {
  const cutoff = now.getTime() - lookbackHours * 60 * 60 * 1000;

  const recent = events.filter((event) => {
    const ts = new Date(event.occurredAt).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });

  const latestFailureAt = recent
    .map((event) => new Date(event.occurredAt).getTime())
    .filter((ts) => !Number.isNaN(ts))
    .sort((a, b) => b - a)[0];

  const providers = Array.from(new Set(recent.map((event) => event.provider))).sort();

  const status: WebhookFailureSummary["status"] =
    recent.length >= CRITICAL_THRESHOLD
      ? "critical"
      : recent.length >= WARNING_THRESHOLD
        ? "warning"
        : "ok";

  return {
    totalFailures: events.length,
    recentFailures: recent.length,
    providers,
    latestFailureAt: latestFailureAt ? new Date(latestFailureAt).toISOString() : null,
    status,
  };
}
