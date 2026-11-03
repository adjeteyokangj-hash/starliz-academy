import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { curriculumReadiness } from "@/lib/coding/curriculum/registry";

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;
  return NextResponse.json({ curriculum: curriculumReadiness() });
}
