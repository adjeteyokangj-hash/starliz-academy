import {
  resolveAppBuildVersion,
  resolveAppInstanceId,
  resolveAppRuntimeEnvironment,
} from "./app-meta";

export type DeploymentsReport = {
  monitoringMode: "api-discovered";
  application: "StarLiz Academy";
  environment: string;
  version: string;
  instanceId: string;
  commitSha: string | null;
  deployedAt: string | null;
  checkedAt: string;
};

export function buildDeploymentsReport(): DeploymentsReport {
  const environment = resolveAppRuntimeEnvironment();
  const version = resolveAppBuildVersion();
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;

  return {
    monitoringMode: "api-discovered",
    application: "StarLiz Academy",
    environment,
    version,
    instanceId: resolveAppInstanceId(environment),
    commitSha,
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? null : null,
    checkedAt: new Date().toISOString(),
  };
}
