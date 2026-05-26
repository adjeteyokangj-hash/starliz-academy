import { prisma } from "@/lib/db";

function parseTimeout(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10_000;
  }
  return parsed;
}

export function isTrueNumerisFeatureEnabled(): boolean {
  return String(process.env.TRUENUMERIS_INTEGRATION_ENABLED ?? "false").trim().toLowerCase() === "true";
}

export function getTrueNumerisRequestTimeoutMs(): number {
  return parseTimeout(process.env.TRUENUMERIS_REQUEST_TIMEOUT_MS);
}

export function getTrueNumerisDefaultRegion(): "UK" | "GH" {
  const region = String(process.env.TRUENUMERIS_DEFAULT_REGION ?? "UK").trim().toUpperCase();
  return region === "GH" ? "GH" : "UK";
}

export function getTrueNumerisWebhookSecret(): string | null {
  const secret = String(process.env.TRUENUMERIS_WEBHOOK_SECRET ?? "").trim();
  return secret || null;
}

export async function getTrueNumerisIntegrationRow() {
  return prisma.trueNumerisIntegration.findFirst({ orderBy: { createdAt: "asc" } });
}
