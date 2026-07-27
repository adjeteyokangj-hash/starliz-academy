import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { fromDbRecord } from "@/lib/child_profile_db";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import {
  createChildSelectionToken,
  getChildSelectionCookieName,
  getChildSelectionMaxAgeSeconds,
} from "@/lib/auth";

const schema = z.object({
  childId: z.string().min(1),
});

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ child: null });
  }

  const activeChildId = await resolveParentActiveChildId(parentScope.parentId);
  if (!activeChildId) {
    return NextResponse.json({ child: null });
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: activeChildId, parentId: parentScope.parentId, archived: false },
  });

  return NextResponse.json({ child: child ? fromDbRecord(child) : null });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  try {
    const body = schema.parse(await request.json());
    const child = await prisma.childProfile.findFirst({
      where: { id: body.childId, parentId: parentScope.parentId, archived: false },
      select: { id: true },
    });
    if (!child) {
      return NextResponse.json({ error: "Child not found." }, { status: 404 });
    }

    await prisma.user.update({ where: { id: parentScope.parentId }, data: { activeChildId: body.childId } });

    // Keep child-selection cookie in sync so student Short Learning surfaces
    // cannot retain a stale child after a portal switch.
    const selectionToken = await createChildSelectionToken(parentScope.parentId, body.childId);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(getChildSelectionCookieName(), selectionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getChildSelectionMaxAgeSeconds(),
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
