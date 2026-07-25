import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api_guard";

import { canDo } from "@/lib/schools/permissions";

import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

import {

  computeShortLearningForecast,

  type ShortLearningView,

} from "@/lib/schools/short-learning-coverage";



const VALID_VIEWS: ShortLearningView[] = ["7d", "48h", "deadline", "late-capacity-only"];



function parseView(raw: string | null): ShortLearningView {

  if (raw && VALID_VIEWS.includes(raw as ShortLearningView)) {

    return raw as ShortLearningView;

  }

  return "7d";

}



export async function GET(request: Request) {

  const { session, response } = await requireSession();

  if (!session) return response;



  const ctx = await requireSchoolAdminContext(session.userId);

  if (!ctx) {

    return NextResponse.json({ error: "School admin access required." }, { status: 403 });

  }

  if (!canDo(ctx.role, "viewDashboard") && !canDo(ctx.role, "viewHumanSupport")) {

    return NextResponse.json({ error: "Not permitted to view demand forecast." }, { status: 403 });

  }



  const { searchParams } = new URL(request.url);

  const view = parseView(searchParams.get("view"));



  const forecast = await computeShortLearningForecast({

    schoolId: ctx.schoolId,

    view,

  });



  return NextResponse.json({ ok: true, forecast });

}


