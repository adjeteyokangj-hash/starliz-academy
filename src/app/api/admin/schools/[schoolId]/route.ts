import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { findSchoolAdminRecord } from "@/lib/schools/school-admin-payload";

type Params = { params: Promise<{ schoolId: string }> };

export async function handleAdminSchoolGet(
  _request: Request,
  context: Params,
  deps: {
    requireAdminPermission: typeof requireAdminPermission;
    findSchoolAdminRecord: typeof findSchoolAdminRecord;
  } = {
    requireAdminPermission,
    findSchoolAdminRecord,
  },
) {
  const { session, response } = await deps.requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId } = await context.params;
  const school = await deps.findSchoolAdminRecord(schoolId);
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  return NextResponse.json({ school });
}

export async function GET(request: Request, context: Params) {
  return handleAdminSchoolGet(request, context);
}
