import { NextResponse } from "next/server";
import { authenticateExternalApiKey } from "@/lib/api-management";

import { buildIntegrationsReport } from "@/lib/external-monitoring/integrations";

export async function GET(request: Request) {
  const auth = await authenticateExternalApiKey(request, { requiredScopes: ["api:read"] });
  if (!auth.ok) return auth.response;
  return NextResponse.json(await buildIntegrationsReport());
}
