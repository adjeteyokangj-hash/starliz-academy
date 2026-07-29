import { getDatabaseStatus } from "./database";
import type { MonitoringStatus } from "./capability-registry";
import { rollupStatus } from "./status";

export type ServiceStatusRow = {
  id: string;
  name: string;
  category: string;
  status: MonitoringStatus;
};

export type ServicesReport = {
  status: MonitoringStatus;
  checkedAt: string;
  services: ServiceStatusRow[];
};

export async function buildServicesReport(): Promise<ServicesReport> {
  const database = await getDatabaseStatus();
  const services: ServiceStatusRow[] = [
    {
      id: "web-application",
      name: "Web application",
      category: "runtime",
      status: "healthy",
    },
    {
      id: "external-api",
      name: "External API",
      category: "runtime",
      status: "healthy",
    },
    {
      id: "database",
      name: "Database",
      category: "infrastructure",
      status: database.status,
    },
    {
      id: "cron-scheduler",
      name: "Scheduled jobs",
      category: "operations",
      status: "unknown",
    },
  ];

  return {
    status: rollupStatus(services.map((service) => service.status)),
    checkedAt: new Date().toISOString(),
    services,
  };
}
