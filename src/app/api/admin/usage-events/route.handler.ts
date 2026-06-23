import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";

type AdminDeps = { requireAdmin: typeof requireAdmin };

export async function handleAdminUsageEventsPost(
  request: Request,
  deps: AdminDeps = { requireAdmin },
) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const body = await request.json().catch(() => null);

  console.log("[StarLiz usage event]", {
    ...body,
    userId: session.userId,
    email: session.email,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
