import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";

export async function POST() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  return NextResponse.json({
    ok: false,
    message: "Candidate import endpoint is pending extraction-candidate model setup.",
  }, { status: 501 });
}
