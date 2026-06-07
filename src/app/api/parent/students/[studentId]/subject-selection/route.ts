import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import {
  ENGLISH_STRANDS,
  applySubjectSelectionPolicy,
  parentSubjectsForYearGroup,
  resolveSubjectSelectionPolicy,
  sanitizeSelectedSubjects,
  selectedSubjectsToFocusText,
} from "@/lib/subject-selection";
import { resolveCurrentPricingPlan } from "@/lib/pricing/service";

const bodySchema = z.object({
  selectedSubjects: z.array(z.string()).min(1),
});

function parseProfileJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed profile json
  }
  return {};
}

export async function GET(_: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const { studentId } = await params;
  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      id: true,
      yearGroup: true,
      studentProfile: {
        select: {
          subjectFocus: true,
          aiLearningProfileJson: true,
        },
      },
    },
  });
  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { parentId: parentScope.parentId },
    orderBy: { updatedAt: "desc" },
    select: { pricingPlanId: true, planKey: true },
  });
  const currentPricingPlan = await resolveCurrentPricingPlan({
    pricingPlanId: subscription?.pricingPlanId ?? null,
    legacyPlanKey: subscription?.planKey ?? null,
  });
  const policy = resolveSubjectSelectionPolicy({
    planName: currentPricingPlan?.name ?? subscription?.planKey ?? "free",
    childLimit: currentPricingPlan?.childLimit ?? 1,
    yearGroup: child.yearGroup,
  });

  const profileJson = parseProfileJson(child.studentProfile?.aiLearningProfileJson ?? null);
  const selectedFromJson = Array.isArray(profileJson.selectedParentSubjects)
    ? sanitizeSelectedSubjects((profileJson.selectedParentSubjects as unknown[]).map((value) => String(value)))
    : [];
  const selected = selectedFromJson.length
    ? selectedFromJson
    : sanitizeSelectedSubjects((child.studentProfile?.subjectFocus ?? "").split(",").map((entry) => entry.trim()));

  return NextResponse.json({
    ok: true,
    studentId,
    selectedSubjects: selected,
    englishStrands: ENGLISH_STRANDS,
    policy,
    subjects: parentSubjectsForYearGroup(child.yearGroup),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const { studentId } = await params;
  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true, yearGroup: true },
  });
  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subject selection payload." }, { status: 400 });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { parentId: parentScope.parentId },
    orderBy: { updatedAt: "desc" },
    select: { pricingPlanId: true, planKey: true },
  });
  const currentPricingPlan = await resolveCurrentPricingPlan({
    pricingPlanId: subscription?.pricingPlanId ?? null,
    legacyPlanKey: subscription?.planKey ?? null,
  });
  const policy = resolveSubjectSelectionPolicy({
    planName: currentPricingPlan?.name ?? subscription?.planKey ?? "free",
    childLimit: currentPricingPlan?.childLimit ?? 1,
    yearGroup: child.yearGroup,
  });

  const validated = applySubjectSelectionPolicy({
    selected: sanitizeSelectedSubjects(parsed.data.selectedSubjects),
    policy,
  });

  if (validated.errors.length) {
    return NextResponse.json(
      {
        error: validated.errors[0],
        fieldErrors: { selectedSubjects: validated.errors },
      },
      { status: 400 },
    );
  }

  const existing = await prisma.studentProfile.findUnique({
    where: { childId: studentId },
    select: { aiLearningProfileJson: true },
  });

  const profileJson = parseProfileJson(existing?.aiLearningProfileJson ?? null);
  const nextProfileJson = JSON.stringify({
    ...profileJson,
    selectedParentSubjects: validated.selected,
    englishStrands: ENGLISH_STRANDS,
  });

  await prisma.studentProfile.upsert({
    where: { childId: studentId },
    update: {
      subjectFocus: selectedSubjectsToFocusText(validated.selected),
      aiLearningProfileJson: nextProfileJson,
    },
    create: {
      childId: studentId,
      subjectFocus: selectedSubjectsToFocusText(validated.selected),
      aiLearningProfileJson: nextProfileJson,
    },
  });

  return NextResponse.json({
    ok: true,
    studentId,
    selectedSubjects: validated.selected,
    englishStrands: ENGLISH_STRANDS,
    policy,
  });
}
