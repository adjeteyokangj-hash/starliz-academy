import { NextResponse } from "next/server";
import { authenticateExternalApiKey } from "@/lib/api-management";

import { buildServicesReport } from "@/lib/external-monitoring/services";

export async function GET(request: Request) {
  const auth = await authenticateExternalApiKey(request, { requiredScopes: ["api:read"] });
  if (!auth.ok) return auth.response;
  return NextResponse.json(await buildServicesReport());
}
