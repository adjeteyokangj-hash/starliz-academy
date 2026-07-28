import { prisma } from "@/lib/db";
import { currentAcademicYearLabel } from "@/lib/schools/ensure-year-classes";
import {
  defaultPromotionDateForNextYear,
  formatDateOnlyUtc,
  isAcademicYearStatus,
  nextAcademicYearLabel,
  parseDateOnlyUtc,
  type AcademicYearStatus,
} from "@/lib/schools/academic-year-labels";

export type AcademicYearConfigView = {
  id: string;
  schoolId: string;
  currentAcademicYear: string;
  nextAcademicYear: string;
  promotionDate: string;
  status: AcademicYearStatus;
  appliedAt: string | null;
  appliedByUserId: string | null;
  updatedAt: string;
};

function toView(row: {
  id: string;
  schoolId: string;
  currentAcademicYear: string;
  nextAcademicYear: string;
  promotionDate: Date;
  status: string;
  appliedAt: Date | null;
  appliedByUserId: string | null;
  updatedAt: Date;
}): AcademicYearConfigView {
  const status = isAcademicYearStatus(row.status) ? row.status : "waiting";
  return {
    id: row.id,
    schoolId: row.schoolId,
    currentAcademicYear: row.currentAcademicYear,
    nextAcademicYear: row.nextAcademicYear,
    promotionDate: formatDateOnlyUtc(row.promotionDate),
    status,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    appliedByUserId: row.appliedByUserId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOrCreateAcademicYearConfig(schoolId: string): Promise<AcademicYearConfigView> {
  const existing = await prisma.schoolAcademicYearConfig.findUnique({ where: { schoolId } });
  if (existing) return toView(existing);

  const current = currentAcademicYearLabel();
  const next = nextAcademicYearLabel(current);
  const created = await prisma.schoolAcademicYearConfig.create({
    data: {
      schoolId,
      currentAcademicYear: current,
      nextAcademicYear: next,
      promotionDate: defaultPromotionDateForNextYear(next),
      status: "waiting",
    },
  });
  return toView(created);
}

export async function updateAcademicYearConfig(input: {
  schoolId: string;
  currentAcademicYear?: string;
  nextAcademicYear?: string;
  promotionDate?: string;
  status?: AcademicYearStatus;
}): Promise<AcademicYearConfigView | { ok: false; status: number; error: string }> {
  const current = await getOrCreateAcademicYearConfig(input.schoolId);
  if (current.status === "applied" && input.status && input.status !== "applied") {
    // Allow resetting only via explicit rollover re-open path later; for now block silent reopen.
  }

  const data: {
    currentAcademicYear?: string;
    nextAcademicYear?: string;
    promotionDate?: Date;
    status?: string;
  } = {};

  if (input.currentAcademicYear !== undefined) {
    const v = input.currentAcademicYear.trim();
    if (!v) return { ok: false, status: 400, error: "currentAcademicYear is required." };
    data.currentAcademicYear = v;
  }
  if (input.nextAcademicYear !== undefined) {
    const v = input.nextAcademicYear.trim();
    if (!v) return { ok: false, status: 400, error: "nextAcademicYear is required." };
    data.nextAcademicYear = v;
  }
  if (input.promotionDate !== undefined) {
    try {
      data.promotionDate = parseDateOnlyUtc(input.promotionDate);
    } catch {
      return { ok: false, status: 400, error: "promotionDate must be YYYY-MM-DD." };
    }
  }
  if (input.status !== undefined) {
    if (!isAcademicYearStatus(input.status)) {
      return { ok: false, status: 400, error: "Invalid status." };
    }
    if (input.status === "applied") {
      return { ok: false, status: 400, error: "Use the confirm-promotion action to apply rollover." };
    }
    data.status = input.status;
  }

  const updated = await prisma.schoolAcademicYearConfig.update({
    where: { schoolId: input.schoolId },
    data,
  });
  return toView(updated);
}

/** Prefer school config current year; fall back to calendar helper. */
export async function resolveSchoolAcademicYearLabel(schoolId: string, now = new Date()): Promise<string> {
  const row = await prisma.schoolAcademicYearConfig.findUnique({
    where: { schoolId },
    select: { currentAcademicYear: true, status: true },
  });
  if (row?.currentAcademicYear?.trim()) return row.currentAcademicYear.trim();
  return currentAcademicYearLabel(now);
}