import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api_guard";

import { canDo } from "@/lib/schools/permissions";

import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

import { computeShortLearningReliability } from "@/lib/schools/short-learning-coverage";



export async function GET() {

  const { session, response } = await requireSession();

  if (!session) return response;



  const ctx = await requireSchoolAdminContext(session.userId);

  if (!ctx) {

    return NextResponse.json({ error: "School admin access required." }, { status: 403 });

  }

  if (!canDo(ctx.role, "viewStudents") && !canDo(ctx.role, "viewDashboard")) {

    return NextResponse.json({ error: "Not permitted to view reliability." }, { status: 403 });

  }



  const reliability = await computeShortLearningReliability({

    schoolId: ctx.schoolId,

  });



  return NextResponse.json({ ok: true, reliability });

}


