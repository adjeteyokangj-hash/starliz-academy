export type MonitoringStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type CapabilityCategory =
  | "core"
  | "infrastructure"
  | "operations"
  | "integration"
  | "deployment";

export type CapabilityDefinition = {
  key: string;
  enabled: boolean;
  endpoint: string | null;
  requiredScope: "api:read";
  category: CapabilityCategory;
  description: string;
};

/**
 * Single source of truth for what StarLiz exposes to OpsWatch (api-discovered mode).
 * Only enabled capabilities with real endpoints are advertised in discovery.
 */
export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  {
    key: "health",
    enabled: true,
    endpoint: "/api/external/v1/health",
    requiredScope: "api:read",
    category: "core",
    description: "Normalised application health and dependency checks",
  },
  {
    key: "version",
    enabled: true,
    endpoint: "/api/external/v1/deployments",
    requiredScope: "api:read",
    category: "deployment",
    description: "Build/version metadata for the running instance",
  },
  {
    key: "services",
    enabled: true,
    endpoint: "/api/external/v1/services",
    requiredScope: "api:read",
    category: "operations",
    description: "Operational service status summary",
  },
  {
    key: "database",
    enabled: true,
    endpoint: "/api/external/v1/database",
    requiredScope: "api:read",
    category: "infrastructure",
    description: "Database reachability status (no connection details)",
  },
  {
    key: "jobs",
    enabled: true,
    endpoint: "/api/external/v1/jobs",
    requiredScope: "api:read",
    category: "operations",
    description: "Scheduled job freshness summary from JobRunLog",
  },
  {
    key: "integrations",
    enabled: true,
    endpoint: "/api/external/v1/integrations",
    requiredScope: "api:read",
    category: "integration",
    description: "Configured external integrations (names and status only)",
  },
  {
    key: "deployments",
    enabled: true,
    endpoint: "/api/external/v1/deployments",
    requiredScope: "api:read",
    category: "deployment",
    description: "Deployment and environment metadata",
  },
  // Explicitly disabled / not implemented ? kept for catalogue clarity.
  {
    key: "storage",
    enabled: false,
    endpoint: null,
    requiredScope: "api:read",
    category: "infrastructure",
    description: "Object storage health (not yet exposed)",
  },
  {
    key: "queues",
    enabled: false,
    endpoint: null,
    requiredScope: "api:read",
    category: "operations",
    description: "Queue health (not yet exposed)",
  },
] as const;

export function listEnabledCapabilities(): CapabilityDefinition[] {
  return CAPABILITY_REGISTRY.filter((capability) => capability.enabled && Boolean(capability.endpoint));
}

export function capabilitiesMap(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const capability of CAPABILITY_REGISTRY) {
    out[capability.key] = capability.enabled && Boolean(capability.endpoint);
  }
  return out;
}

export function endpointsMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const capability of listEnabledCapabilities()) {
    if (capability.endpoint) out[capability.key] = capability.endpoint;
  }
  return out;
}
