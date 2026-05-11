import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { ChildProfile } from "@/lib/store";
import { fromDbRecord, toDbUpdateInput, withChildDefaults } from "@/lib/child_profile_db";
import { childPayloadSchema } from "@/lib/child_profile_schema";
import { canAddChild } from "@/lib/subscriptions/enforcement";
import { resolveParentScope } from "@/lib/parent_scope";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[children.get] email=${session.email} parentId=none children=0`);
    }
    return NextResponse.json({
      children: [],
      activeChildId: null,
      ...(process.env.NODE_ENV !== "production"
        ? { debug: { email: session.email.toLowerCase(), parentId: "", childrenCount: 0 } }
        : {}),
    });
  }

  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "1";

  const [childrenRows, user] = await Promise.all([
    prisma.childProfile.findMany({
      where: { parentId: parentScope.parentId, ...(includeArchived ? {} : { archived: false }) },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { activeChildId: true } }),
  ]);

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[children.get] email=${session.email} parentId=${parentScope.parentId} children=${childrenRows.length} source=${parentScope.source}`,
    );
  }

  return NextResponse.json({
    children: childrenRows.map(fromDbRecord),
    activeChildId: user?.activeChildId ?? null,
    ...(process.env.NODE_ENV !== "production"
      ? { debug: { email: session.email.toLowerCase(), parentId: parentScope.parentId, childrenCount: childrenRows.length } }
      : {}),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Only parent accounts can create child profiles." }, { status: 403 });
  }

  try {
    const body = childPayloadSchema.parse(await request.json());
    const normalized = withChildDefaults(body as Partial<ChildProfile>);
    const existingChild = await prisma.childProfile.findFirst({ where: { id: normalized.id, parentId: parentScope.parentId } });
    if (!existingChild) {
      const access = await canAddChild(parentScope.parentId);
      if (!access.allowed) {
        return NextResponse.json({ error: "Subscription upgrade required.", access }, { status: 402 });
      }
    }

    await prisma.childProfile.upsert({
      where: { id: normalized.id },
      create: {
        id: normalized.id,
        parentId: parentScope.parentId,
        ...toDbUpdateInput(normalized),
      },
      update: {
        parentId: parentScope.parentId,
        ...toDbUpdateInput(normalized),
      },
    });

    await prisma.user.update({
      where: { id: parentScope.parentId },
      data: { activeChildId: normalized.id },
    });

    return NextResponse.json({ ok: true, child: normalized }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid child payload." }, { status: 400 });
  }
}
