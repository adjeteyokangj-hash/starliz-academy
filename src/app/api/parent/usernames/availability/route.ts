import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { checkChildUsernameAvailability } from "@/lib/child-account-credentials";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  if (session.role !== "parent") {
    return NextResponse.json({ error: "Only parents can check child usernames." }, { status: 403 });
  }

  const parentScope = await resolveParentScope(session);
  if (!parentScope || parentScope.parentId !== session.userId) {
    return NextResponse.json({ error: "Only parents can check child usernames." }, { status: 403 });
  }

  const url = new URL(request.url);
  const username = url.searchParams.get("username")?.trim() ?? "";
  const childName = url.searchParams.get("childName")?.trim() || null;
  if (!username) {
    return NextResponse.json({ error: "username is required." }, { status: 400 });
  }

  const result = await checkChildUsernameAvailability({
    username,
    childName,
    isTaken: async (candidate) => {
      const existing = await prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    },
  });

  return NextResponse.json({
    ok: true,
    username: result.username,
    valid: result.valid,
    available: result.available,
    message: result.message,
    suggestions: result.suggestions,
  });
}