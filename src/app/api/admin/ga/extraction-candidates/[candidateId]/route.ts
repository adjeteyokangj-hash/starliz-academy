import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";

export async function PATCH() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  return NextResponse.json({
    ok: false,
    message: "Candidate editing endpoint is pending extraction-candidate model setup.",
  }, { status: 501 });
}
