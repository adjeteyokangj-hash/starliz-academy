import { NextResponse } from "next/server";
import { cleanupAbandonedUploadSessions } from "@/lib/lesson-pack-import/upload-session";
import { cleanupExpiredLocalObjects } from "@/lib/lesson-pack-import/object-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`
    || request.headers.get("x-cron-secret") === secret;
}

/**
 * Idempotent cleanup for abandoned lesson-pack upload sessions and local temp objects.
 * Does not delete Content Library drafts, approved, or published content.
 */
export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionsCleaned = await cleanupAbandonedUploadSessions();
  const localObjectsCleaned = await cleanupExpiredLocalObjects();

  return NextResponse.json({
    ok: true,
    sessionsCleaned,
    localObjectsCleaned,
    retentionHours: 24,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
