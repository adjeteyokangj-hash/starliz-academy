import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import {
  createChildSelectionToken,
  getChildSelectionCookieName,
  getChildSelectionMaxAgeSeconds,
  getParentUnlockCookieName,
  verifyPassword,
} from "@/lib/auth";
import { readChildPinState } from "@/lib/child_pin";

const schema = z.object({
  childId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/).optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid child profile request." }, { status: 400 });
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: body.childId, parentId: parentScope.parentId, archived: false },
    select: { id: true, name: true, coachingMemoryJson: true },
  });

  if (!child) {
    return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
  }

  const pinState = readChildPinState(child.coachingMemoryJson);
  if (pinState.pinEnabled) {
    if (!body.pin) {
      return NextResponse.json({ error: "PIN required.", pinRequired: true }, { status: 400 });
    }

    const valid = pinState.pinHash ? await verifyPassword(body.pin, pinState.pinHash) : false;
    if (!valid) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }
  }

  await prisma.user.update({
    where: { id: parentScope.parentId },
    data: { activeChildId: child.id },
  });

  const token = await createChildSelectionToken(parentScope.parentId, child.id);
  const reply = NextResponse.json({ ok: true, child: { id: child.id, name: child.name } });
  reply.cookies.set(getChildSelectionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getChildSelectionMaxAgeSeconds(),
  });
  reply.cookies.set(getParentUnlockCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return reply;
}
