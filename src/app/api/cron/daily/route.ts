import { NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/jobs";

function hasCronAccess(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function POST(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyJobs();
  return NextResponse.json(result);
}
