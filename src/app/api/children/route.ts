import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { ChildProfile } from "@/lib/store";
import { fromDbRecord, toDbUpdateInput, withChildDefaults } from "@/lib/child_profile_db";
import { childPayloadSchema } from "@/lib/child_profile_schema";
import { canAddChild } from "@/lib/subscriptions/enforcement";
import { resolveParentScope } from "@/lib/parent_scope";
import { writeAuditLog } from "@/lib/audit";
import { resolveCurrentPricingPlan } from "@/lib/pricing/service";
import { resolveActiveChildForSession } from "@/lib/activeChild";
import {
  ENGLISH_STRANDS,
  applySubjectSelectionPolicy,
  resolveSubjectSelectionPolicy,
  sanitizeSelectedSubjects,
  selectedSubjectsToFocusText,
} from "@/lib/subject-selection";
import {
  resolveUkStudentYearFields,
  syncChildAcademicFieldsFromDob,
  syncChildrenAcademicFieldsFromDob,
} from "@/lib/uk-student-year";
import { keyStageForYearGroup } from "@/lib/curriculum";

function isTransientDbSaturationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("EMAXCONNSESSION")
    || message.includes("too many connections")
    || message.includes("PrismaClientInitializationError")
    || message.includes("PrismaClientUnknownRequestError")
  );
}

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  // Independent student login: return the single linked ChildProfile (via userId).
  // Parent-scoped listing remains below; students must not get an empty list that
  // causes client bootstrap to bounce them to /profiles.
  if (session.role === "student") {
    const resolved = await resolveActiveChildForSession(session);
    if (!resolved.ok) {
      return NextResponse.json({ children: [], activeChildId: null, code: resolved.reason });
    }
    await syncChildAcademicFieldsFromDob(resolved.childId);
    const child = await prisma.childProfile.findFirst({
      where: { id: resolved.childId, userId: session.userId, archived: false },
      include: {
        account: { select: { username: true } },
        studentProfile: { select: { dateOfBirth: true, keyStageLevel: true } },
        _count: { select: { schoolLinks: true } },
      },
    });
    if (!child) {
      return NextResponse.json({ children: [], activeChildId: null, code: "no_linked_profile" });
    }
    const profile = fromDbRecord(child);
    const dobIso = child.studentProfile?.dateOfBirth?.toISOString() ?? null;
    return NextResponse.json({
      children: [
        {
          ...profile,
          dateOfBirth: dobIso ?? profile.dateOfBirth,
          keyStageLevel: child.studentProfile?.keyStageLevel || profile.keyStageLevel,
          ageYears: child.age ?? profile.ageYears,
          yearGroup: child.yearGroup ?? profile.yearGroup,
          yearGroupLocked: child.yearGroupLocked,
          userId: child.userId,
          hasLogin: true,
          loginUsername: child.account?.username ?? null,
          hasSchoolLink: child._count.schoolLinks > 0,
          canCreateLogin: false,
        },
      ],
      activeChildId: child.id,
    });
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- include widens findMany row shape for login fields
  let childrenRows: any[] = [];
  let user: { activeChildId: string | null } | null = null;
  let profileRows: Array<{ childId: string; subjectFocus: string | null }> = [];
  try {
    [childrenRows, user] = await Promise.all([
      prisma.childProfile.findMany({
        where: { parentId: parentScope.parentId, ...(includeArchived ? {} : { archived: false }) },
        orderBy: { createdAt: "asc" },
        include: {
          account: { select: { username: true } },
          studentProfile: { select: { dateOfBirth: true, keyStageLevel: true, subjectFocus: true } },
          _count: { select: { schoolLinks: true } },
        },
      }),
      prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { activeChildId: true } }),
    ]);
    await syncChildrenAcademicFieldsFromDob(childrenRows.map((child) => child.id as string));
    childrenRows = await prisma.childProfile.findMany({
      where: { parentId: parentScope.parentId, ...(includeArchived ? {} : { archived: false }) },
      orderBy: { createdAt: "asc" },
      include: {
        account: { select: { username: true } },
        studentProfile: { select: { dateOfBirth: true, keyStageLevel: true, subjectFocus: true } },
        _count: { select: { schoolLinks: true } },
      },
    });
    profileRows = childrenRows.map((child) => ({
      childId: child.id as string,
      subjectFocus: child.studentProfile?.subjectFocus ?? null,
    }));
  } catch (error) {
    if (isTransientDbSaturationError(error)) {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please retry in a few seconds.", retryable: true },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    throw error;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[children.get] email=${session.email} parentId=${parentScope.parentId} children=${childrenRows.length} source=${parentScope.source}`,
    );
  }

  const focusByChildId = new Map<string, string | null>(profileRows.map((row) => [row.childId, row.subjectFocus]));

  return NextResponse.json({
    children: childrenRows.map((row) => {
      const profile = fromDbRecord(row) as Record<string, unknown>;
      const selectedSubjects = sanitizeSelectedSubjects((focusByChildId.get(row.id) ?? "").split(",").map((entry) => entry.trim()));
      const hasSchoolLink = row._count.schoolLinks > 0;
      const dobIso = row.studentProfile?.dateOfBirth
        ? new Date(row.studentProfile.dateOfBirth).toISOString()
        : null;
      return {
        ...profile,
        dateOfBirth: dobIso ?? profile.dateOfBirth,
        keyStageLevel: row.studentProfile?.keyStageLevel || profile.keyStageLevel,
        ageYears: row.age ?? profile.ageYears,
        yearGroup: row.yearGroup ?? profile.yearGroup,
        yearGroupLocked: Boolean(row.yearGroupLocked),
        selectedSubjects,
        userId: row.userId,
        hasLogin: Boolean(row.userId),
        loginUsername: row.account?.username ?? null,
        hasSchoolLink,
        // Consumer Create Login is only for parent-owned profiles without school roster links.
        canCreateLogin: !row.userId && !hasSchoolLink,
      };
    }),
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
    const rawBody = await request.json();
    const parsed = childPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      if (process.env.NODE_ENV !== "production") {
        console.info("[children.post] validation_error", { fieldErrors, body: rawBody });
      }
      return NextResponse.json({ error: "Invalid child payload.", fieldErrors }, { status: 400 });
    }

    const body = parsed.data;
    const derived = resolveUkStudentYearFields({
      dateOfBirth: body.dateOfBirth,
      currentYearGroup: body.yearGroup,
      yearGroupLocked: false,
    });
    const resolvedYearGroup = derived.yearGroup ?? body.yearGroup;
    const resolvedAgeYears = derived.ageYears ?? body.ageYears;
    const resolvedKeyStage = derived.keyStageLevel ?? body.keyStageLevel ?? (resolvedYearGroup ? keyStageForYearGroup(resolvedYearGroup) : undefined);
    const normalized = withChildDefaults({
      ...(body as Partial<ChildProfile>),
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
        yearGroupLocked: false,
        ...toDbUpdateInput(normalized),
      },
      update: {
        parentId: parentScope.parentId,
        yearGroupLocked: false,
        ...toDbUpdateInput(normalized),
      },
    });

    await prisma.studentProfile.upsert({
      where: { childId: normalized.id },
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
        childId: normalized.id,
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

    await prisma.user.update({
      where: { id: parentScope.parentId },
      data: { activeChildId: normalized.id },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "child.created",
      entityType: "child_profile",
      entityId: normalized.id,
      metadata: {
        parentId: parentScope.parentId,
        yearGroup: resolvedYearGroup,
        keyStageLevel: resolvedKeyStage ?? null,
        selectedSubjects: selectedSubjects.selected,
      },
    });

    return NextResponse.json({ ok: true, child: normalized }, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[children.post] unexpected_error", error);
    }
    return NextResponse.json({ error: "Invalid child payload." }, { status: 400 });
  }
}
