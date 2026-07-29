import {
  resolveAppBuildVersion,
  resolveAppRuntimeEnvironment,
} from "./app-meta";
import { getDatabaseStatus } from "./database";
import type { MonitoringStatus } from "./capability-registry";
import { rollupStatus } from "./status";

export type ExternalHealthReport = {
  status: MonitoringStatus;
  service: "StarLiz Academy";
  environment: string;
  version: string;
  timestamp: string;
  checks: {
    application: MonitoringStatus;
    database: MonitoringStatus;
  };
};

export async function buildExternalHealthReport(): Promise<ExternalHealthReport> {
  const database = await getDatabaseStatus();
  const application: MonitoringStatus = "healthy";
  const status = rollupStatus([application, database.status]);

  return {
    status,
    service: "StarLiz Academy",
    environment: resolveAppRuntimeEnvironment(),
    version: resolveAppBuildVersion(),
    timestamp: new Date().toISOString(),
    checks: {
      application,
      database: database.status,
    },
  };
}
