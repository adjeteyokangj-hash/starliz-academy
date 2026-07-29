import { NextResponse } from "next/server";
import { authenticateExternalApiKey } from "@/lib/api-management";

import { buildDiscoveryDocument } from "@/lib/external-monitoring/discovery";

/**
 * OpsWatch Application Discovery Contract (v1).
 * Auth: StarLiz generated API key with api:read. No browser session / heartbeat required.
 */
export async function GET(request: Request) {
  const auth = await authenticateExternalApiKey(request, { requiredScopes: ["api:read"] });
  if (!auth.ok) return auth.response;
  return NextResponse.json(buildDiscoveryDocument());
}
