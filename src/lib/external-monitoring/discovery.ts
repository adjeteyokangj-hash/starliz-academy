import {
  capabilitiesMap,
  endpointsMap,
  listEnabledCapabilities,
} from "./capability-registry";
import {
  resolveAppBuildVersion,
  resolveAppInstanceId,
  resolveAppRuntimeEnvironment,
} from "./app-meta";

export type DiscoveryDocument = {
  schemaVersion: "1.0";
  application: {
    name: "StarLiz Academy";
    environment: string;
    version: string;
    instanceId: string;
  };
  monitoringMode: "api-discovered";
  capabilities: Record<string, boolean>;
  endpoints: Record<string, string>;
  authentication: {
    type: "bearer";
    requiredScopes: Record<string, "api:read">;
  };
  registry: Array<{
    key: string;
    enabled: true;
    endpoint: string;
    requiredScope: "api:read";
    category: string;
    description: string;
  }>;
};

export function buildDiscoveryDocument(): DiscoveryDocument {
  const environment = resolveAppRuntimeEnvironment();
  const version = resolveAppBuildVersion();
  const enabled = listEnabledCapabilities();

  const requiredScopes: Record<string, "api:read"> = {};
  for (const capability of enabled) {
    requiredScopes[capability.key] = "api:read";
  }

  return {
    schemaVersion: "1.0",
    application: {
      name: "StarLiz Academy",
      environment,
      version,
      instanceId: resolveAppInstanceId(environment),
    },
    monitoringMode: "api-discovered",
    capabilities: capabilitiesMap(),
    endpoints: endpointsMap(),
    authentication: {
      type: "bearer",
      requiredScopes,
    },
    registry: enabled.map((capability) => ({
      key: capability.key,
      enabled: true as const,
      endpoint: capability.endpoint as string,
      requiredScope: "api:read" as const,
      category: capability.category,
      description: capability.description,
    })),
  };
}
