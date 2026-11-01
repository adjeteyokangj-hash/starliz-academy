import { NextResponse } from "next/server";
import { resolveActiveChildForSession } from "@/lib/activeChild";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";

export async function requireCodingLearner() {
  const { session, response } = await requireSession();
  if (!session) return { child: null, response };
  const resolved = await resolveActiveChildForSession(session);
  if (!resolved.ok) {
    return {
      child: null,
      response: NextResponse.json({ error: "Choose a learner profile first." }, { status: 400 }),
    };
  }
  const child = await prisma.childProfile.findFirst({
    where: { id: resolved.childId, archived: false },
    select: { id: true, yearGroup: true, name: true },
  });
  if (!child) {
    return {
      child: null,
      response: NextResponse.json({ error: "Learner profile not found." }, { status: 404 }),
    };
  }
  return { child, response: null as unknown as NextResponse };
}
