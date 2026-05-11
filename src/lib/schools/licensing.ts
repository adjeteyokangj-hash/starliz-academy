import { prisma } from "@/lib/db";

export type SchoolLicenceBlockedReason =
  | "NO_SCHOOL"
  | "NO_LICENCE"
  | "LICENCE_EXPIRED"
  | "LICENCE_PAST_DUE"
  | "LICENCE_SUSPENDED"
  | "SEAT_LIMIT_REACHED";

export type SchoolSeatDecision = {
  allowed: boolean;
  reason?: SchoolLicenceBlockedReason;
  schoolId: string;
  status?: string;
  seatsUsed: number;
  seatsAllowed: number;
  seatsAvailable: number;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
};

export type SchoolLicenceDecision = {
  allowed: boolean;
  reason?: SchoolLicenceBlockedReason;
  schoolId?: string;
  schoolName?: string;
  status?: string;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
};

const ACTIVE_LICENCE_STATUSES = new Set(["active", "pilot", "trialing"]);

function isLicenceCurrentlyUsable(licence: {
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}): { allowed: boolean; reason?: SchoolLicenceBlockedReason } {
  const status = licence.status.toLowerCase();
  const now = new Date();

  if (status === "suspended") return { allowed: false, reason: "LICENCE_SUSPENDED" };
  if (status === "past_due") return { allowed: false, reason: "LICENCE_PAST_DUE" };
  if (status === "cancelled") {
    return licence.currentPeriodEnd && licence.currentPeriodEnd >= now
      ? { allowed: true }
      : { allowed: false, reason: "LICENCE_EXPIRED" };
  }
  if (status === "trialing") {
    return !licence.trialEndsAt || licence.trialEndsAt >= now
      ? { allowed: true }
      : { allowed: false, reason: "LICENCE_EXPIRED" };
  }
  if (ACTIVE_LICENCE_STATUSES.has(status)) return { allowed: true };

  return { allowed: false, reason: "LICENCE_EXPIRED" };
}

function formatLicenceDecision(input: {
  schoolId: string;
  schoolName: string;
  licence: {
    status: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
  } | null;
}): SchoolLicenceDecision {
  if (!input.licence) {
    return {
      allowed: false,
      reason: "NO_LICENCE",
      schoolId: input.schoolId,
      schoolName: input.schoolName,
    };
  }

  const statusCheck = isLicenceCurrentlyUsable(input.licence);
  if (!statusCheck.allowed) {
    return {
      allowed: false,
      reason: statusCheck.reason,
      schoolId: input.schoolId,
      schoolName: input.schoolName,
      status: input.licence.status,
      trialEndsAt: input.licence.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: input.licence.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  return {
    allowed: true,
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    status: input.licence.status,
    trialEndsAt: input.licence.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: input.licence.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function getSchoolSeatUsage(schoolId: string) {
  const [school, seatsUsed] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      include: { licence: true },
    }),
    prisma.schoolStudent.count({
      where: { schoolId, status: "active" },
    }),
  ]);

  if (!school) {
    return {
      school: null,
      licence: null,
      seatsUsed: 0,
      seatsAllowed: 0,
      seatsAvailable: 0,
    };
  }

  const seatsAllowed = school.licence?.seatLimit ?? 0;

  return {
    school,
    licence: school.licence,
    seatsUsed,
    seatsAllowed,
    seatsAvailable: Math.max(0, seatsAllowed - seatsUsed),
  };
}

export async function canAddSchoolStudent(schoolId: string): Promise<SchoolSeatDecision> {
  const usage = await getSchoolSeatUsage(schoolId);

  if (!usage.school) {
    return {
      allowed: false,
      reason: "NO_SCHOOL",
      schoolId,
      seatsUsed: 0,
      seatsAllowed: 0,
      seatsAvailable: 0,
    };
  }

  if (!usage.licence) {
    return {
      allowed: false,
      reason: "NO_LICENCE",
      schoolId,
      seatsUsed: usage.seatsUsed,
      seatsAllowed: 0,
      seatsAvailable: 0,
    };
  }

  const licenceStatus = isLicenceCurrentlyUsable(usage.licence);
  if (!licenceStatus.allowed) {
    return {
      allowed: false,
      reason: licenceStatus.reason,
      schoolId,
      status: usage.licence.status,
      seatsUsed: usage.seatsUsed,
      seatsAllowed: usage.seatsAllowed,
      seatsAvailable: usage.seatsAvailable,
      trialEndsAt: usage.licence.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: usage.licence.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  if (usage.seatsAllowed > 0 && usage.seatsUsed >= usage.seatsAllowed) {
    return {
      allowed: false,
      reason: "SEAT_LIMIT_REACHED",
      schoolId,
      status: usage.licence.status,
      seatsUsed: usage.seatsUsed,
      seatsAllowed: usage.seatsAllowed,
      seatsAvailable: 0,
      trialEndsAt: usage.licence.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: usage.licence.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  return {
    allowed: true,
    schoolId,
    status: usage.licence.status,
    seatsUsed: usage.seatsUsed,
    seatsAllowed: usage.seatsAllowed,
    seatsAvailable: usage.seatsAllowed === 0 ? Number.MAX_SAFE_INTEGER : usage.seatsAvailable,
    trialEndsAt: usage.licence.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: usage.licence.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function evaluateUserSchoolLoginAccess(userId: string): Promise<SchoolLicenceDecision> {
  const school = await prisma.school.findFirst({
    where: {
      status: { not: "archived" },
      OR: [
        { ownerUserId: userId },
        {
          teachers: {
            some: {
              userId,
              status: { in: ["active", "invited"] },
            },
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      licence: {
        select: {
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
        },
      },
    },
  });

  if (!school) {
    return { allowed: true };
  }

  return formatLicenceDecision({
    schoolId: school.id,
    schoolName: school.name,
    licence: school.licence,
  });
}

export async function evaluateStudentAssignmentAccess(studentId: string): Promise<SchoolLicenceDecision> {
  const link = await prisma.schoolStudent.findFirst({
    where: {
      childId: studentId,
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
    select: {
      schoolId: true,
      school: {
        select: {
          id: true,
          name: true,
          licence: {
            select: {
              status: true,
              trialEndsAt: true,
              currentPeriodEnd: true,
              seatLimit: true,
            },
          },
        },
      },
    },
  });

  if (!link) {
    return { allowed: true };
  }

  const licenceDecision = formatLicenceDecision({
    schoolId: link.school.id,
    schoolName: link.school.name,
    licence: link.school.licence,
  });
  if (!licenceDecision.allowed) {
    return licenceDecision;
  }

  const seatLimit = link.school.licence?.seatLimit ?? 0;
  if (seatLimit > 0) {
    const activeSeats = await prisma.schoolStudent.count({
      where: {
        schoolId: link.schoolId,
        status: "active",
      },
    });
    if (activeSeats > seatLimit) {
      return {
        allowed: false,
        reason: "SEAT_LIMIT_REACHED",
        schoolId: link.school.id,
        schoolName: link.school.name,
        status: link.school.licence?.status,
        trialEndsAt: link.school.licence?.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: link.school.licence?.currentPeriodEnd?.toISOString() ?? null,
      };
    }
  }

  return licenceDecision;
}
