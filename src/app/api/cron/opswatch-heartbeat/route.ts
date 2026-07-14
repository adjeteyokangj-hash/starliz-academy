import { NextResponse } from "next/server";
import { sendConfiguredOpsWatchHeartbeat } from "@/lib/opswatch/integration";

function hasCronAccess(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-cron-secret") === secret
  );
}

async function runHeartbeatJob() {
  const result = await sendConfiguredOpsWatchHeartbeat({ requireEnabled: true });
  return {
    ok: result.ok,
    message: result.message,
    responseCode: result.responseCode,
    ranAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runHeartbeatJob();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function POST(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runHeartbeatJob();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
