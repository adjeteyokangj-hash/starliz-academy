import { NextResponse } from "next/server";
import { checkRateLimit, requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { readActivityBody } from "@/lib/coding/learning/request";
import { demonstrationReadSchema, privateDemonstrationResponse } from "@/lib/coding/learning/demonstration-response";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { session, response } = await requireSession(); if (!session) return response;
    if (session.role !== "parent") return NextResponse.json({ error: "Parent access required." }, { status: 403, headers });
    const body = demonstrationReadSchema.parse(await readActivityBody(request)), scope = await resolveParentScope(session);
    if (!scope || !body.studentId) return NextResponse.json({ error: "Choose your child." }, { status: 404, headers });
    const child = await prisma.childProfile.findFirst({ where: { id: body.studentId, parentId: scope.parentId, archived: false }, select: { id: true } });
    if (!child) return NextResponse.json({ error: "Child not found." }, { status: 404, headers });
    if (!checkRateLimit({ key: `coding-parent-demo:${scope.parentId}`, limit: 30, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause before opening another clip." }, { status: 429, headers });
    return await privateDemonstrationResponse(child.id, body);
  } catch { return NextResponse.json({ error: "This private recording is not available to your account." }, { status: 404, headers }); }
}
