export function resolveAppBuildVersion(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.npm_package_version?.trim() ||
    "starliz-academy"
  );
}

export function resolveAppRuntimeEnvironment(fallback = "production"): string {
  const raw = (
    process.env.VERCEL_ENV ||
    process.env.OPSWATCH_ENVIRONMENT ||
    process.env.NODE_ENV ||
    fallback
  )
    .trim()
    .toLowerCase();
  if (raw === "preview" || raw === "staging") return "staging";
  if (raw === "development" || raw === "test") return "development";
  return "production";
}

export function resolveAppInstanceId(environment = resolveAppRuntimeEnvironment()): string {
  return `starliz-${environment}`;
}
