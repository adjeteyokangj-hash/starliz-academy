/**
 * UK academic-year resolution for student age / year group / key stage.
 *
 * - Cohort cut-off: 31 August / 1 September (who shares a year group).
 * - Academic calendar: after July the next school year applies (Aug-Jul labelling),
 *   matching UK term practice where year groups roll forward before September start.
 * - Admin may lock year group; age still always follows date of birth.
 */

import { prisma } from "@/lib/db";
import { keyStageForYearGroup, normalizeYearGroup } from "@/lib/curriculum";
import {
  calculateAgeFromDateOfBirth,
  suggestUkYearGroupFromDateOfBirth,
} from "@/lib/registration/child-profile-options";

export {
  calculateAgeFromDateOfBirth,
  suggestUkYearGroupFromDateOfBirth,
} from "@/lib/registration/child-profile-options";

export type ResolvedUkStudentYearFields = {
  ageYears: number | null;
  derivedYearGroup: string | null;
  yearGroup: string | null;
  keyStageLevel: string | null;
  yearGroupLocked: boolean;
};

export function resolveUkStudentYearFields(input: {
  dateOfBirth: string | Date | null | undefined;
  currentYearGroup?: string | null;
  yearGroupLocked?: boolean;
  now?: Date;
}): ResolvedUkStudentYearFields {
  const now = input.now ?? new Date();
  const locked = Boolean(input.yearGroupLocked);
  const dobIso =
    input.dateOfBirth instanceof Date
      ? (Number.isNaN(input.dateOfBirth.getTime()) ? null : input.dateOfBirth.toISOString().slice(0, 10))
      : typeof input.dateOfBirth === "string" && input.dateOfBirth.trim()
        ? input.dateOfBirth.trim().slice(0, 10)
        : null;

  const ageYears = dobIso ? calculateAgeFromDateOfBirth(dobIso, now) : null;
  const derivedYearGroup = dobIso ? suggestUkYearGroupFromDateOfBirth(dobIso, now) : null;
  const currentNormalized =
    normalizeYearGroup(input.currentYearGroup) ?? (input.currentYearGroup?.trim() || null);

  const yearGroup = locked
    ? (currentNormalized ?? derivedYearGroup)
    : (derivedYearGroup ?? currentNormalized);

  const keyStageLevel = yearGroup ? keyStageForYearGroup(yearGroup) : null;

  return {
    ageYears,
    derivedYearGroup,
    yearGroup,
    keyStageLevel,
    yearGroupLocked: locked,
  };
}

function patchSnapshotAcademicFields(
  snapshotJson: string | null | undefined,
  patch: {
    ageYears: number | null;
    yearGroup: string | null;
    keyStageLevel: string | null;
    dateOfBirth: string | null;
  },
): string | null {
  let base: Record<string, unknown> = {};
  if (snapshotJson) {
    try {
      const parsed = JSON.parse(snapshotJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      base = {};
    }
  }

  if (patch.ageYears !== null) base.ageYears = patch.ageYears;
  if (patch.yearGroup) {
    base.yearGroup = patch.yearGroup;
    base.schoolYear = patch.yearGroup;
  }
  if (patch.keyStageLevel) base.keyStageLevel = patch.keyStageLevel;
  if (patch.dateOfBirth) {
    base.dateOfBirth = patch.dateOfBirth;
    const onboarding = base.onboarding;
    if (onboarding && typeof onboarding === "object" && !Array.isArray(onboarding)) {
      base.onboarding = {
        ...(onboarding as Record<string, unknown>),
        dateOfBirth: patch.dateOfBirth,
        keyStage: patch.keyStageLevel,
      };
    }
  }

  return JSON.stringify(base);
}

export type SyncChildAcademicResult = {
  childId: string;
  updated: boolean;
  age: number | null;
  yearGroup: string | null;
  keyStageLevel: string | null;
  yearGroupLocked: boolean;
  derivedYearGroup: string | null;
};

/**
 * Persist current UK age (always) and year/key stage (when unlocked) from DOB.
 * No-op when there is no DOB. Safe to call on profile reads.
 */
export async function syncChildAcademicFieldsFromDob(
  childId: string,
  options?: { now?: Date },
): Promise<SyncChildAcademicResult | null> {
  const now = options?.now ?? new Date();
  const child = await prisma.childProfile.findUnique({
    where: { id: childId },
    select: {
      id: true,
      age: true,
      yearGroup: true,
      yearGroupLocked: true,
      snapshotJson: true,
      studentProfile: { select: { dateOfBirth: true, keyStageLevel: true } },
      schoolLinks: {
        where: { status: "active" },
        select: { holdBackFromPromotion: true },
        take: 5,
      },
    },
  });

  if (!child) return null;

  const dob = child.studentProfile?.dateOfBirth ?? null;
  if (!dob) {
    return {
      childId,
      updated: false,
      age: child.age,
      yearGroup: child.yearGroup,
      keyStageLevel: child.studentProfile?.keyStageLevel ?? null,
      yearGroupLocked: child.yearGroupLocked,
      derivedYearGroup: null,
    };
  }

  const holdBack = child.schoolLinks.some((link) => link.holdBackFromPromotion);
  const locked = child.yearGroupLocked || holdBack;
  const resolved = resolveUkStudentYearFields({
    dateOfBirth: dob,
    currentYearGroup: child.yearGroup,
    yearGroupLocked: locked,
    now,
  });

  const nextAge = resolved.ageYears;
  const nextYear = resolved.yearGroup;
  const nextKeyStage = locked
    ? (child.studentProfile?.keyStageLevel
      ?? (child.yearGroup ? keyStageForYearGroup(child.yearGroup) : null)
      ?? resolved.keyStageLevel)
    : resolved.keyStageLevel;

  const ageChanged = nextAge !== null && nextAge !== child.age;
  const yearChanged = Boolean(nextYear) && nextYear !== child.yearGroup;
  const keyStageChanged = Boolean(nextKeyStage) && nextKeyStage !== (child.studentProfile?.keyStageLevel ?? null);

  if (!ageChanged && !yearChanged && !keyStageChanged) {
    return {
      childId,
      updated: false,
      age: child.age,
      yearGroup: child.yearGroup,
      keyStageLevel: child.studentProfile?.keyStageLevel ?? null,
      yearGroupLocked: locked,
      derivedYearGroup: resolved.derivedYearGroup,
    };
  }

  const dobIso = dob.toISOString().slice(0, 10);
  const nextSnapshot = patchSnapshotAcademicFields(child.snapshotJson, {
    ageYears: nextAge,
    yearGroup: nextYear,
    keyStageLevel: nextKeyStage,
    dateOfBirth: dobIso,
  });

  await prisma.$transaction(async (tx) => {
    await tx.childProfile.update({
      where: { id: childId },
      data: {
        ...(ageChanged ? { age: nextAge } : {}),
        ...(yearChanged ? { yearGroup: nextYear } : {}),
        ...(nextSnapshot ? { snapshotJson: nextSnapshot } : {}),
      },
    });
    if (keyStageChanged || yearChanged) {
      await tx.studentProfile.upsert({
        where: { childId },
        create: {
          childId,
          dateOfBirth: dob,
          keyStageLevel: nextKeyStage,
        },
        update: {
          ...(keyStageChanged ? { keyStageLevel: nextKeyStage } : {}),
        },
      });
    }
  });

  return {
    childId,
    updated: true,
    age: nextAge ?? child.age,
    yearGroup: yearChanged ? nextYear : child.yearGroup,
    keyStageLevel: keyStageChanged ? nextKeyStage : (child.studentProfile?.keyStageLevel ?? null),
    yearGroupLocked: locked,
    derivedYearGroup: resolved.derivedYearGroup,
  };
}

/** Batch sync for parent children lists — best-effort, continues on individual failures. */
export async function syncChildrenAcademicFieldsFromDob(
  childIds: string[],
  options?: { now?: Date },
): Promise<Map<string, SyncChildAcademicResult>> {
  const out = new Map<string, SyncChildAcademicResult>();
  for (const id of childIds) {
    try {
      const result = await syncChildAcademicFieldsFromDob(id, options);
      if (result) out.set(id, result);
    } catch {
      // Leave row as-is; next request can retry.
    }
  }
  return out;
}

/**
 * Decide lock flag when admin/parent saves year group alongside DOB.
 * Lock when an explicit year differs from the DOB-derived year.
 */
export function shouldLockYearGroupFromSave(input: {
  dateOfBirth?: string | Date | null;
  yearGroup?: string | null;
  yearGroupLocked?: boolean | null;
  now?: Date;
}): boolean {
  if (typeof input.yearGroupLocked === "boolean") return input.yearGroupLocked;
  if (!input.dateOfBirth || !input.yearGroup) return false;
  const derived = resolveUkStudentYearFields({
    dateOfBirth: input.dateOfBirth,
    now: input.now,
  }).derivedYearGroup;
  if (!derived) return false;
  const normalized = normalizeYearGroup(input.yearGroup) ?? input.yearGroup.trim();
  return normalized !== derived;
}