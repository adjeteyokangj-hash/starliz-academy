import { NextResponse } from "next/server";
import { isTrueNumerisFeatureEnabled } from "@/lib/truenumeris/config";

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: isTrueNumerisFeatureEnabled(),
    mode: "foundation",
    autoTaxSubmission: false,
  });
}
