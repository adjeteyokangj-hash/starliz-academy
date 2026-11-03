import { NextResponse } from "next/server";

import { buildSafeHealthReport } from "@/lib/ops/health";

export async function handleHealthGet() {
  const report = buildSafeHealthReport();
  const status = report.ok ? 200 : 503;

  return NextResponse.json(report, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

export async function GET() {
  return handleHealthGet();
}
