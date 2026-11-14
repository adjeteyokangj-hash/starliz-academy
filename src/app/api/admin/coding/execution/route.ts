import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, requireAdminPermission } from "@/lib/api_guard";
import { codingRunnerHealth, executeCodingSource } from "@/lib/coding/execution/client";

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_SETTINGS");
  if (!session) return response;
  try { return NextResponse.json(await codingRunnerHealth()); }
  catch { return NextResponse.json({ available: false, error: "The isolated execution service is not configured or verified yet." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;
  const limit = checkRateLimit({ key: `coding-runner-preview:${session.userId}`, limit: 10, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Execution preview limit reached. Try again shortly." }, { status: 429 });
  const parsed = z.object({ language: z.enum(["python", "javascript", "sql"]), source: z.string().min(1).max(65536), stdin: z.string().max(8192).optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a supported language and a bounded source program." }, { status: 400 });
  try { return NextResponse.json({ result: await executeCodingSource(parsed.data), previewOnly: true }); }
  catch { return NextResponse.json({ error: "Isolated execution is unavailable. No host-process fallback is permitted." }, { status: 503 }); }
}
