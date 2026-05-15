import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { ChildProfile } from "@/lib/store";
import { fromDbRecord, toDbUpdateInput, withChildDefaults } from "@/lib/child_profile_db";
import { childPayloadSchema } from "@/lib/child_profile_schema";
import { resolveParentScope } from "@/lib/parent_scope";
import { writeAuditLog } from "@/lib/audit";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeIncomingChildPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;

  const learningGoals = Array.isArray(source.learningGoals)
    ? source.learningGoals
    : typeof source.learningGoals === "string"
      ? source.learningGoals.split("\n")
      : undefined;

  return {
    ...source,
    name: normalizeOptionalString(source.name) ?? source.name,
    avatar: normalizeOptionalString(source.avatar) ?? source.avatar,
    yearGroup: normalizeOptionalString(source.yearGroup) ?? source.yearGroup,
    schoolYear: normalizeOptionalString(source.schoolYear),
    keyStageLevel: normalizeOptionalString(source.keyStageLevel),
    subjectLevel: normalizeOptionalString(source.subjectLevel),
    dateOfBirth: normalizeOptionalString(source.dateOfBirth),
    senSupportNeeds: normalizeOptionalString(source.senSupportNeeds ?? source.supportNeeds),
    learningGoals: learningGoals
      ?.map((goal) => (typeof goal === "string" ? goal.trim() : ""))
      .filter(Boolean),
  };
}

function isTransientDbSaturationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("EMAXCONNSESSION")
    || message.includes("too many connections")
    || message.includes("PrismaClientInitializationError")
    || message.includes("PrismaClientUnknownRequestError")
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const { id } = await params;
  let child: Awaited<ReturnType<typeof prisma.childProfile.findFirst>> = null;
  try {
    child = await prisma.childProfile.findFirst({ where: { id, parentId: parentScope.parentId } });
  } catch (error) {
    if (isTransientDbSaturationError(error)) {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please retry in a few seconds.", retryable: true },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    throw error;
  }
  if (!child) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  return NextResponse.json({ child: fromDbRecord(child) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const { id } = await params;
  const mode = new URL(request.url).searchParams.get("mode");

  const existing = await prisma.childProfile.findFirst({ where: { id, parentId: parentScope.parentId } });
  if (!existing) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  if (mode === "restore") {
    const restored = await prisma.childProfile.update({
      where: { id },
      data: { archived: false },
    });
    return NextResponse.json({ ok: true, child: fromDbRecord(restored) });
  }

  try {
    const rawBody = await request.json();
    const normalizedBody = normalizeIncomingChildPayload(rawBody);
    const parsed = childPayloadSchema.safeParse(normalizedBody);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      if (process.env.NODE_ENV !== "production") {
        console.info("[children.put] validation_error", { fieldErrors, childId: id });
      }
      return NextResponse.json({ error: "Invalid child payload.", fieldErrors }, { status: 400 });
    }

    const body = parsed.data;
    const normalized = withChildDefaults({ ...(body as Partial<ChildProfile>), id });

    const updated = await prisma.childProfile.update({
      where: { id },
      data: {
        ...toDbUpdateInput(normalized),
      },
    });

    await prisma.studentProfile.upsert({
      where: { childId: id },
      update: {
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        keyStageLevel: body.keyStageLevel ?? null,
        learningLevel: body.subjectLevel ?? null,
        senSupportNeeds: body.senSupportNeeds ?? null,
        weakAreasText: body.learningGoals?.join(", ") ?? null,
        subjectFocus: body.subjectLevel ?? null,
      },
      create: {
        childId: id,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        keyStageLevel: body.keyStageLevel ?? null,
        learningLevel: body.subjectLevel ?? null,
        senSupportNeeds: body.senSupportNeeds ?? null,
        weakAreasText: body.learningGoals?.join(", ") ?? null,
        subjectFocus: body.subjectLevel ?? null,
      },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "child.updated",
      entityType: "child_profile",
      entityId: id,
      metadata: {
        parentId: parentScope.parentId,
        yearGroup: body.yearGroup,
        keyStageLevel: body.keyStageLevel ?? null,
      },
    });

    return NextResponse.json({ ok: true, child: fromDbRecord(updated) });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[children.put] unexpected_error", error);
    }
    return NextResponse.json({ error: "Invalid child payload." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const { id } = await params;
  const mode = new URL(request.url).searchParams.get("mode") ?? "soft";

  const existing = await prisma.childProfile.findFirst({ where: { id, parentId: parentScope.parentId } });
  if (!existing) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  if (mode === "hard") {
    await prisma.childProfile.delete({ where: { id } });
  } else {
    await prisma.childProfile.update({ where: { id }, data: { archived: true } });
  }

  const user = await prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { activeChildId: true } });
  if (user?.activeChildId === id) {
    const fallback = await prisma.childProfile.findFirst({ where: { parentId: parentScope.parentId, archived: false }, orderBy: { createdAt: "asc" } });
    await prisma.user.update({ where: { id: parentScope.parentId }, data: { activeChildId: fallback?.id ?? null } });
  }

  return NextResponse.json({ ok: true, mode });
}
