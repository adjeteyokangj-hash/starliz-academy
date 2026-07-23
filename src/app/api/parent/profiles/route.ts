import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { loadParentProfilesPayload } from "@/lib/parent-profiles";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const payload = await loadParentProfilesPayload(session);
  if (!payload) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  return NextResponse.json(payload);
}
