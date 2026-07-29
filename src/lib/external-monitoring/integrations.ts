import { listConnections } from "@/lib/api-management/connections";
import type { MonitoringStatus } from "./capability-registry";
import { rollupStatus } from "./status";

function mapConnectionStatus(status: string): MonitoringStatus {
  if (status === "connected") return "healthy";
  if (status === "auth_failed" || status === "unreachable") return "unhealthy";
  if (status === "disabled" || status === "not_tested") return "unknown";
  return "unknown";
}

export type IntegrationsReport = {
  status: MonitoringStatus;
  checkedAt: string;
  integrations: Array<{
    id: string;
    name: string;
    environment: string;
    enabled: boolean;
    status: MonitoringStatus;
    lastCheckedAt: string | null;
  }>;
};

export async function buildIntegrationsReport(): Promise<IntegrationsReport> {
  let connections: Awaited<ReturnType<typeof listConnections>> = [];
  try {
    connections = await listConnections();
  } catch {
    connections = [];
  }

  const integrations = connections.map((connection) => ({
    id: connection.id,
    name: connection.name,
    environment: connection.environment,
    enabled: connection.enabled,
    status: mapConnectionStatus(connection.status),
    lastCheckedAt: connection.lastTestedAt,
  }));

  return {
    status: integrations.length
      ? rollupStatus(integrations.map((row) => row.status))
      : "unknown",
    checkedAt: new Date().toISOString(),
    integrations,
  };
}
