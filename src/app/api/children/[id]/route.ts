import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { ChildProfile } from "@/lib/store";
import { fromDbRecord, toDbUpdateInput, withChildDefaults } from "@/lib/child_profile_db";
import { childPayloadSchema } from "@/lib/child_profile_schema";
import { resolveParentScope } from "@/lib/parent_scope";
import { writeAuditLog } from "@/lib/audit";
import { resolveCurrentPricingPlan } from "@/lib/pricing/service";
import {
  ENGLISH_STRANDS,
  applySubjectSelectionPolicy,
  resolveSubjectSelectionPolicy,
  sanitizeSelectedSubjects,
  selectedSubjectsToFocusText,
} from "@/lib/subject-selection";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { resolveUkStudentYearFields, syncChildAcademicFieldsFromDob } from "@/lib/uk-student-year";

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
  try {
    await syncChildAcademicFieldsFromDob(id);
  } catch {
    // Continue with stored values if sync fails.
  }
  let child: Awaited<ReturnType<typeof prisma.childProfile.findFirst>> = null;
  let profile: { subjectFocus: string | null; dateOfBirth: Date | null; keyStageLevel: string | null } | null = null;
  try {
    child = await prisma.childProfile.findFirst({ where: { id, parentId: parentScope.parentId } });
    profile = await prisma.studentProfile.findUnique({
      where: { childId: id },
      select: { subjectFocus: true, dateOfBirth: true, keyStageLevel: true },
    });
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

  const selectedSubjects = sanitizeSelectedSubjects((profile?.subjectFocus ?? "").split(",").map((entry) => entry.trim()));
  const mapped = fromDbRecord(child);
  return NextResponse.json({
    child: {
      ...mapped,
      selectedSubjects,
      dateOfBirth: profile?.dateOfBirth?.toISOString() ?? mapped.dateOfBirth,
      keyStageLevel: profile?.keyStageLevel || mapped.keyStageLevel,
      ageYears: child.age ?? mapped.ageYears,
      yearGroup: child.yearGroup ?? mapped.yearGroup,
      yearGroupLocked: child.yearGroupLocked,
    },
  });
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
    const existingLocked = existing.yearGroupLocked;
    const derived = resolveUkStudentYearFields({
      dateOfBirth: body.dateOfBirth,
      currentYearGroup: body.yearGroup,
      // Parents cannot lock; keep existing admin/school lock.
      yearGroupLocked: existingLocked,
    });
    const resolvedYearGroup = existingLocked
      ? (body.yearGroup || existing.yearGroup || derived.yearGroup || "")
      : (derived.yearGroup ?? body.yearGroup);
    const resolvedAgeYears = derived.ageYears ?? body.ageYears;
    const resolvedKeyStage = existingLocked
      ? (body.keyStageLevel || derived.keyStageLevel || (resolvedYearGroup ? keyStageForYearGroup(resolvedYearGroup) : undefined))
      : (derived.keyStageLevel ?? body.keyStageLevel ?? (resolvedYearGroup ? keyStageForYearGroup(resolvedYearGroup) : undefined));

    const normalized = withChildDefaults({
      ...(body as Partial<ChildProfile>),
      id,
      yearGroup: resolvedYearGroup,
      ageYears: resolvedAgeYears,
      keyStageLevel: resolvedKeyStage,
      schoolYear: resolvedYearGroup,
    });
    const subscription = await prisma.subscription.findFirst({
      where: { parentId: parentScope.parentId },
      orderBy: { updatedAt: "desc" },
      select: { pricingPlanId: true, planKey: true },
    });
    const currentPricingPlan = await resolveCurrentPricingPlan({
      pricingPlanId: subscription?.pricingPlanId ?? null,
      legacyPlanKey: subscription?.planKey ?? null,
    });
    const subjectPolicy = resolveSubjectSelectionPolicy({
      planName: currentPricingPlan?.name ?? subscription?.planKey ?? "free",
      childLimit: currentPricingPlan?.childLimit ?? 1,
      yearGroup: resolvedYearGroup,
    });
    const selectedSubjects = applySubjectSelectionPolicy({
      selected: sanitizeSelectedSubjects(body.selectedSubjects),
      policy: subjectPolicy,
    });
    if (selectedSubjects.errors.length > 0) {
      return NextResponse.json(
        {
          error: selectedSubjects.errors[0],
          fieldErrors: { selectedSubjects: selectedSubjects.errors },
        },
        { status: 400 },
      );
    }

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
        keyStageLevel: resolvedKeyStage ?? null,
        learningLevel: body.subjectLevel ?? null,
        senSupportNeeds: body.senSupportNeeds ?? null,
        weakAreasText: body.learningGoals?.join(", ") ?? null,
        subjectFocus: selectedSubjectsToFocusText(selectedSubjects.selected),
        aiLearningProfileJson: JSON.stringify({
          selectedParentSubjects: selectedSubjects.selected,
          englishStrands: ENGLISH_STRANDS,
        }),
      },
      create: {
        childId: id,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        keyStageLevel: resolvedKeyStage ?? null,
        learningLevel: body.subjectLevel ?? null,
        senSupportNeeds: body.senSupportNeeds ?? null,
        weakAreasText: body.learningGoals?.join(", ") ?? null,
        subjectFocus: selectedSubjectsToFocusText(selectedSubjects.selected),
        aiLearningProfileJson: JSON.stringify({
          selectedParentSubjects: selectedSubjects.selected,
          englishStrands: ENGLISH_STRANDS,
        }),
      },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "child.updated",
      entityType: "child_profile",
      entityId: id,
      metadata: {
        parentId: parentScope.parentId,
        yearGroup: resolvedYearGroup,
        keyStageLevel: resolvedKeyStage ?? null,
        selectedSubjects: selectedSubjects.selected,
      },
    });

    return NextResponse.json({
      ok: true,
      child: {
        ...fromDbRecord(updated),
        dateOfBirth: body.dateOfBirth ?? null,
        keyStageLevel: resolvedKeyStage ?? "",
        ageYears: resolvedAgeYears,
        yearGroup: resolvedYearGroup,
        yearGroupLocked: existingLocked,
      },
    });
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

  const existing = await prisma.childProfile.findFirst({
    where: { id, parentId: parentScope.parentId },
    select: {
      id: true,
      name: true,
      archived: true,
      userId: true,
      _count: { select: { schoolLinks: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  if (existing._count.schoolLinks > 0 && !existing.userId) {
    return NextResponse.json(
      {
        error: "School-managed students cannot be removed from the parent portal.",
        code: "school_managed_child",
      },
      { status: 403 },
    );
  }

  if (existing.archived && mode !== "hard") {
    return NextResponse.json({ ok: true, mode: "soft", alreadyArchived: true });
  }

  if (mode === "hard") {
    await prisma.childProfile.delete({ where: { id } });
  } else {
    await prisma.childProfile.update({ where: { id }, data: { archived: true } });
  }

  const user = await prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { activeChildId: true } });
  if (user?.activeChildId === id) {
    const fallback = await prisma.childProfile.findFirst({
      where: { parentId: parentScope.parentId, archived: false },
      orderBy: { createdAt: "asc" },
    });
    await prisma.user.update({
      where: { id: parentScope.parentId },
      data: { activeChildId: fallback?.id ?? null },
    });
  }

  void writeAuditLog({
    actorUserId: parentScope.parentId,
    action: mode === "hard" ? "child_removed_hard" : "child_removed",
    entityType: "ChildProfile",
    entityId: id,
    metadata: {
      mode,
      childName: existing.name,
    },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, mode });
}
