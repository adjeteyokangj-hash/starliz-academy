import { prisma } from "@/lib/db";
import { nextPromotableYearGroup } from "@/lib/schools/student-year-context";
import { ensureSchoolYearClasses } from "@/lib/schools/ensure-year-classes";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { getOrCreateAcademicYearConfig } from "@/lib/schools/academic-year-config";
import { nextAcademicYearLabel, defaultPromotionDateForNextYear } from "@/lib/schools/academic-year-labels";
import { normalizeYearGroup } from "@/lib/curriculum";

export type RolloverPreviewRow = {
  schoolStudentId: string;
  childId: string;
  childName: string;
  fromYearGroup: string | null;
  toYearGroup: string | null;
  holdBack: boolean;
  action: "promote" | "hold" | "skip_max" | "skip_invalid";
};

export type RolloverPreview = {
  config: Awaited<ReturnType<typeof getOrCreateAcademicYearConfig>>;
  rows: RolloverPreviewRow[];
  promoteCount: number;
  holdCount: number;
  skipCount: number;
};

export async function previewAcademicYearRollover(schoolId: string): Promise<RolloverPreview> {
  const config = await getOrCreateAcademicYearConfig(schoolId);
  const students = await prisma.schoolStudent.findMany({
    where: { schoolId, status: "active" },
    select: {
      id: true,
      childId: true,
      holdBackFromPromotion: true,
      child: { select: { name: true, yearGroup: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  const rows: RolloverPreviewRow[] = students.map((s) => {
    const from = s.child.yearGroup?.trim() || null;
    if (s.holdBackFromPromotion) {
      return {
        schoolStudentId: s.id,
        childId: s.childId,
        childName: s.child.name,
        fromYearGroup: from,
        toYearGroup: from,
        holdBack: true,
        action: "hold",
      };
    }
    const next = nextPromotableYearGroup(from);
    if (!from || !normalizeYearGroup(from)) {
      return {
        schoolStudentId: s.id,
        childId: s.childId,
        childName: s.child.name,
        fromYearGroup: from,
        toYearGroup: null,
        holdBack: false,
        action: "skip_invalid",
      };
    }
    if (!next) {
      return {
        schoolStudentId: s.id,
        childId: s.childId,
        childName: s.child.name,
        fromYearGroup: from,
        toYearGroup: from,
        holdBack: false,
        action: "skip_max",
      };
    }
    return {
      schoolStudentId: s.id,
      childId: s.childId,
      childName: s.child.name,
      fromYearGroup: from,
      toYearGroup: next,
      holdBack: false,
      action: "promote",
    };
  });

  return {
    config,
    rows,
    promoteCount: rows.filter((r) => r.action === "promote").length,
    holdCount: rows.filter((r) => r.action === "hold").length,
    skipCount: rows.filter((r) => r.action === "skip_max" || r.action === "skip_invalid").length,
  };
}

export async function applyAcademicYearRollover(input: {
  schoolId: string;
  actorUserId: string;
  confirm: boolean;
}): Promise<
  | {
      ok: true;
      promoted: number;
      held: number;
      skipped: number;
      academicYearFrom: string;
      academicYearTo: string;
    }
  | { ok: false; status: number; error: string }
> {
  if (!input.confirm) {
    return { ok: false, status: 400, error: "Confirmation required to apply academic-year rollover." };
  }

  const preview = await previewAcademicYearRollover(input.schoolId);
  if (preview.config.status === "applied") {
    return { ok: false, status: 409, error: "Rollover already applied for this cycle. Update config to start a new cycle." };
  }

  const academicYearFrom = preview.config.currentAcademicYear;
  const academicYearTo = preview.config.nextAcademicYear;

  const ensured = await ensureSchoolYearClasses({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    academicYear: academicYearTo,
  });
  if (!ensured.ok) {
    return { ok: false, status: ensured.status, error: ensured.error };
  }

  const yearClassByGroup = new Map<string, string>(
    [...ensured.created, ...ensured.reused, ...ensured.restored].map((c) => [c.yearGroup, c.id]),
  );
  // Also load any existing classrooms for the target academic year.
  const classes = await prisma.classroom.findMany({
    where: { schoolId: input.schoolId, academicYear: academicYearTo, status: "active" },
    select: { id: true, yearGroup: true },
  });
  for (const c of classes) {
    if (c.yearGroup) yearClassByGroup.set(c.yearGroup, c.id);
  }

  let promoted = 0;
  let held = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of preview.rows) {
      if (row.action === "hold") {
        held += 1;
        await tx.studentYearChange.create({
          data: {
            schoolId: input.schoolId,
            childId: row.childId,
            schoolStudentId: row.schoolStudentId,
            fromYearGroup: row.fromYearGroup,
            toYearGroup: row.fromYearGroup ?? row.toYearGroup ?? "unchanged",
            reason: "hold_back",
            academicYearFrom,
            academicYearTo,
            actorUserId: input.actorUserId,
            metadataJson: JSON.stringify({ action: "hold" }),
          },
        });
        continue;
      }
      if (row.action !== "promote" || !row.toYearGroup) {
        skipped += 1;
        continue;
      }

      await tx.childProfile.update({
        where: { id: row.childId },
        data: { yearGroup: row.toYearGroup },
      });

      const classroomId = yearClassByGroup.get(row.toYearGroup) ?? null;
      if (classroomId) {
        await tx.schoolStudent.update({
          where: { id: row.schoolStudentId },
          data: { classroomId },
        });
      }

      await tx.studentYearChange.create({
        data: {
          schoolId: input.schoolId,
          childId: row.childId,
          schoolStudentId: row.schoolStudentId,
          fromYearGroup: row.fromYearGroup,
          toYearGroup: row.toYearGroup,
          reason: "rollover",
          academicYearFrom,
          academicYearTo,
          actorUserId: input.actorUserId,
          metadataJson: JSON.stringify({ classroomId }),
        },
      });
      promoted += 1;
    }

    const following = nextAcademicYearLabel(academicYearTo);
    await tx.schoolAcademicYearConfig.update({
      where: { schoolId: input.schoolId },
      data: {
        currentAcademicYear: academicYearTo,
        nextAcademicYear: following,
        promotionDate: defaultPromotionDateForNextYear(following),
        status: "applied",
        appliedAt: new Date(),
        appliedByUserId: input.actorUserId,
      },
    });
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "student_updated",
    entityType: "school",
    entityId: input.schoolId,
    metadata: {
      event: "academic_year_rollover_applied",
      academicYearFrom,
      academicYearTo,
      promoted,
      held,
      skipped,
    },
    severity: "info",
  });

  return {
    ok: true,
    promoted,
    held,
    skipped,
    academicYearFrom,
    academicYearTo,
  };
}

export async function earlyPromoteStudent(input: {
  schoolId: string;
  schoolStudentId: string;
  actorUserId: string;
}): Promise<{ ok: true; from: string | null; to: string } | { ok: false; status: number; error: string }> {
  const membership = await prisma.schoolStudent.findFirst({
    where: { id: input.schoolStudentId, schoolId: input.schoolId, status: "active" },
    select: {
      id: true,
      childId: true,
      holdBackFromPromotion: true,
      child: { select: { yearGroup: true } },
    },
  });
  if (!membership) return { ok: false, status: 404, error: "Student not found." };
  if (membership.holdBackFromPromotion) {
    return { ok: false, status: 409, error: "Clear hold-back before early promotion." };
  }
  const from = membership.child.yearGroup?.trim() || null;
  const to = nextPromotableYearGroup(from);
  if (!to) return { ok: false, status: 400, error: "Student cannot be promoted further." };

  const config = await getOrCreateAcademicYearConfig(input.schoolId);
  const targetClass = await prisma.classroom.findFirst({
    where: {
      schoolId: input.schoolId,
      academicYear: config.currentAcademicYear,
      yearGroup: to,
      status: "active",
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.childProfile.update({
      where: { id: membership.childId },
      data: { yearGroup: to },
    });
    if (targetClass) {
      await tx.schoolStudent.update({
        where: { id: membership.id },
        data: { classroomId: targetClass.id },
      });
    }
    await tx.studentYearChange.create({
      data: {
        schoolId: input.schoolId,
        childId: membership.childId,
        schoolStudentId: membership.id,
        fromYearGroup: from,
        toYearGroup: to,
        reason: "early_promote",
        academicYearFrom: config.currentAcademicYear,
        academicYearTo: config.currentAcademicYear,
        actorUserId: input.actorUserId,
        metadataJson: JSON.stringify({ classroomId: targetClass?.id ?? null }),
      },
    });
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "student_updated",
    entityType: "student",
    entityId: membership.id,
    metadata: { event: "early_promote", from, to },
    severity: "info",
  });

  return { ok: true, from, to };
}

export async function setStudentHoldBack(input: {
  schoolId: string;
  schoolStudentId: string;
  holdBack: boolean;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const membership = await prisma.schoolStudent.findFirst({
    where: { id: input.schoolStudentId, schoolId: input.schoolId },
    select: { id: true, childId: true, holdBackFromPromotion: true, child: { select: { yearGroup: true } } },
  });
  if (!membership) return { ok: false, status: 404, error: "Student not found." };

  await prisma.schoolStudent.update({
    where: { id: membership.id },
    data: { holdBackFromPromotion: input.holdBack },
  });

  const config = await getOrCreateAcademicYearConfig(input.schoolId);
  await prisma.studentYearChange.create({
    data: {
      schoolId: input.schoolId,
      childId: membership.childId,
      schoolStudentId: membership.id,
      fromYearGroup: membership.child.yearGroup,
      toYearGroup: membership.child.yearGroup ?? "unchanged",
      reason: "hold_back",
      academicYearFrom: config.currentAcademicYear,
      academicYearTo: config.currentAcademicYear,
      actorUserId: input.actorUserId,
      metadataJson: JSON.stringify({ holdBack: input.holdBack }),
    },
  });

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "student_updated",
    entityType: "student",
    entityId: membership.id,
    metadata: { event: "hold_back_from_promotion", holdBack: input.holdBack },
    severity: "info",
  });

  return { ok: true };
}

export async function listStudentYearChanges(input: {
  schoolId: string;
  childId?: string;
  take?: number;
}) {
  return prisma.studentYearChange.findMany({
    where: {
      schoolId: input.schoolId,
      ...(input.childId ? { childId: input.childId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.take ?? 50,
    include: {
      child: { select: { id: true, name: true, yearGroup: true } },
    },
  });
}

/**
 * Scheduled apply: schools with status `ready` whose promotionDate has arrived.
 * Waiting schools are never auto-applied (manual delay allowed).
 */
export async function applyDueAcademicYearRollovers(now = new Date()): Promise<{
  checked: number;
  applied: number;
  failed: number;
  results: Array<{ schoolId: string; ok: boolean; error?: string }>;
}> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const due = await prisma.schoolAcademicYearConfig.findMany({
    where: {
      status: "ready",
      promotionDate: { lte: today },
    },
    select: { schoolId: true },
  });

  const results: Array<{ schoolId: string; ok: boolean; error?: string }> = [];
  let applied = 0;
  let failed = 0;

  for (const row of due) {
    const result = await applyAcademicYearRollover({
      schoolId: row.schoolId,
      actorUserId: "system:academic-year-cron",
      confirm: true,
    });
    if (result.ok) {
      applied += 1;
      results.push({ schoolId: row.schoolId, ok: true });
    } else {
      failed += 1;
      results.push({ schoolId: row.schoolId, ok: false, error: result.error });
    }
  }

  return { checked: due.length, applied, failed, results };
}

/** Record a manual year-group edit against StudentYearChange. */
export async function recordManualYearChange(input: {
  schoolId: string;
  childId: string;
  schoolStudentId: string;
  fromYearGroup: string | null;
  toYearGroup: string;
  actorUserId: string;
}) {
  if ((input.fromYearGroup ?? null) === input.toYearGroup) return;
  const config = await getOrCreateAcademicYearConfig(input.schoolId);
  await prisma.studentYearChange.create({
    data: {
      schoolId: input.schoolId,
      childId: input.childId,
      schoolStudentId: input.schoolStudentId,
      fromYearGroup: input.fromYearGroup,
      toYearGroup: input.toYearGroup,
      reason: "manual_override",
      academicYearFrom: config.currentAcademicYear,
      academicYearTo: config.currentAcademicYear,
      actorUserId: input.actorUserId,
    },
  });
}