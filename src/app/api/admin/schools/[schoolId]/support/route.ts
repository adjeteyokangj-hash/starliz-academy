import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { getAdminSupportOperations } from "@/lib/schools/admin-support-dashboard";

type Params = { params: Promise<{ schoolId: string }> };

export async function GET(_request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const operations = await getAdminSupportOperations({ schoolId });
  if (!operations) {
    return NextResponse.json({ error: "Unable to load support operations." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, operations });
}
