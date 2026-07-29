import { NextResponse } from "next/server";
import { authenticateExternalApiKey } from "@/lib/api-management";

/**
 * Lightweight health/auth ping for external systems using StarLiz-generated API keys.
 * Requires scope api:read. Returns service identity and timestamp only (no domain data).
 */
export async function GET(request: Request) {
  const auth = await authenticateExternalApiKey(request, { requiredScopes: ["api:read"] });
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    service: "StarLiz Academy",
    timestamp: new Date().toISOString(),
  });
}
