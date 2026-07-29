import type { MonitoringStatus } from "./capability-registry";

export function mapBinaryReachability(ok: boolean | null): MonitoringStatus {
  if (ok === null) return "unknown";
  return ok ? "healthy" : "unhealthy";
}

export function rollupStatus(statuses: MonitoringStatus[]): MonitoringStatus {
  if (statuses.includes("unhealthy")) return "unhealthy";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.includes("unknown")) return "unknown";
  if (statuses.every((status) => status === "healthy")) return "healthy";
  return "unknown";
}
