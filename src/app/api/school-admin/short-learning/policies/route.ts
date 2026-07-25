import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api_guard";

import { canDo } from "@/lib/schools/permissions";

import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

import {

  listShortLearningPolicies,

  updateShortLearningPolicies,

} from "@/lib/schools/short-learning-coverage";



export async function GET() {

  const { session, response } = await requireSession();

  if (!session) return response;



  const ctx = await requireSchoolAdminContext(session.userId);

  if (!ctx) {

    return NextResponse.json({ error: "School admin access required." }, { status: 403 });

  }

  if (!canDo(ctx.role, "manageSchoolSettings") && !canDo(ctx.role, "viewDashboard")) {

    return NextResponse.json({ error: "Not permitted to view policies." }, { status: 403 });

  }



  const policies = await listShortLearningPolicies(ctx.schoolId);

  return NextResponse.json({ ok: true, policies });

}



export async function PATCH(request: Request) {

  const { session, response } = await requireSession();

  if (!session) return response;



  const ctx = await requireSchoolAdminContext(session.userId);

  if (!ctx) {

    return NextResponse.json({ error: "School admin access required." }, { status: 403 });

  }

  if (!canDo(ctx.role, "manageSchoolSettings")) {

    return NextResponse.json({ error: "Not permitted to update policies." }, { status: 403 });

  }



  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {

    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  }



  const payload = body as {

    windows?: Array<{

      id: string;

      opensAt?: string;

      closesAt?: string;

      capacityPerSlot?: number;

      startIntervalMinutes?: number;

      active?: boolean;

    }>;

    reliability?: {

      noShowThreshold?: number;

      lateCancelThreshold?: number;

      lookbackDays?: number;

      restrictBookingDays?: number;

    };

    coverage?: {

      tutorMinutesPerBooking?: number;

    };

  };



  try {

    const policies = await updateShortLearningPolicies({

      schoolId: ctx.schoolId,

      windows: payload.windows,

      reliability: payload.reliability,

      coverage: payload.coverage?.tutorMinutesPerBooking != null

        ? { tutorMinutesPerBooking: payload.coverage.tutorMinutesPerBooking }

        : undefined,

    });

    return NextResponse.json({ ok: true, policies });

  } catch (error) {

    const message = error instanceof Error ? error.message : "Failed to update policies.";

    return NextResponse.json({ error: message }, { status: 400 });

  }

}


