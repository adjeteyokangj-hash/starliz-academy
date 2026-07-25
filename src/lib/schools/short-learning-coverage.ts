import { prisma } from "@/lib/db";
import type { TutorSupportShift } from "@prisma/client";
import {
  ensureDefaultLearningWindows,
  isWithinStandardBookingWindow,
} from "@/lib/schools/short-learning-bookings";
import { getOrCreateSupportPolicy } from "@/lib/schools/human-support-presence";
export type ShortLearningView = "7d" | "48h" | "deadline" | "late-capacity-only";
export type ShortLearningPolicySettings = {
  tutorMinutesPerBooking: number;
  noShowThreshold: number;
  lateCancelThreshold: number;
  lookbackDays: number;
  restrictBookingDays: number;
};
export type DemandBucket = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  bookingCount: number;
  lateBooking: boolean;
  estimatedTutorMinutesNeeded: number;
  publishedShiftMinutes: number;
  gapMinutes: number;
  recommendedAdditionalMinutes: number;
};
export type ForecastResult = {
  view: ShortLearningView;
  rangeStart: string;
  rangeEnd: string;
  totalBookings: number;
  peakBookingCount: number;
  buckets: DemandBucket[];
  settings: ShortLearningPolicySettings;
};
export type CoverageResult = {
  view: ShortLearningView;
  rangeStart: string;
  rangeEnd: string;
  totalBookings: number;
  totalEstimatedDemandMinutes: number;
  totalPublishedShiftMinutes: number;
  gapMinutes: number;
  recommendedAdditionalMinutes: number;
  buckets: DemandBucket[];
  settings: ShortLearningPolicySettings;
  note: string;
};
export type ReliabilityParentSummary = {
  parentUserId: string;
  parentEmail: string | null;
  parentName: string | null;
  noShowCount: number;
  lateCancelCount: number;
  totalBookings: number;
  restricted: boolean;
  restrictionReason: string | null;
};
export type ReliabilityResult = {
  lookbackDays: number;
  settings: ShortLearningPolicySettings;
  totals: {
    noShows: number;
    lateCancels: number;
    activeBookings: number;
    restrictedParentCount: number;
  };
  parents: ReliabilityParentSummary[];
};
const ACTIVE_BOOKING_STATUSES = ["booked", "confirmed", "attended"] as const;
const DEFAULT_SETTINGS: ShortLearningPolicySettings = {
  tutorMinutesPerBooking: 8,
  noShowThreshold: 3,
  lateCancelThreshold: 5,
  lookbackDays: 90,
  restrictBookingDays: 14,
};
type PolicyMetadata = {
  shortLearning?: Partial<ShortLearningPolicySettings>;
};
function parsePolicySettings(metadataJson: string | null | undefined): ShortLearningPolicySettings {
  if (!metadataJson) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(metadataJson) as PolicyMetadata;
    const sl = parsed.shortLearning ?? {};
    return {
      tutorMinutesPerBooking: sl.tutorMinutesPerBooking ?? DEFAULT_SETTINGS.tutorMinutesPerBooking,
      noShowThreshold: sl.noShowThreshold ?? DEFAULT_SETTINGS.noShowThreshold,
      lateCancelThreshold: sl.lateCancelThreshold ?? DEFAULT_SETTINGS.lateCancelThreshold,
      lookbackDays: sl.lookbackDays ?? DEFAULT_SETTINGS.lookbackDays,
      restrictBookingDays: sl.restrictBookingDays ?? DEFAULT_SETTINGS.restrictBookingDays,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function mergePolicyMetadata(
  existingJson: string | null | undefined,
  patch: Partial<ShortLearningPolicySettings>,
): string {
  let base: PolicyMetadata = {};
  if (existingJson) {
    try {
      base = JSON.parse(existingJson) as PolicyMetadata;
    } catch {
      base = {};
    }
  }
  return JSON.stringify({
    ...base,
    shortLearning: {
      ...(base.shortLearning ?? {}),
      ...patch,
    },
  });
}
export async function getShortLearningPolicySettings(schoolId: string): Promise<ShortLearningPolicySettings> {
  await getOrCreateSupportPolicy(schoolId);
  const row = await prisma.schoolSupportPolicy.findUnique({
    where: { schoolId },
    select: { metadataJson: true },
  });
  return parsePolicySettings(row?.metadataJson);
}
function viewRange(view: ShortLearningView, now: Date): { start: Date; end: Date } {
  const start = now;
  if (view === "48h") {
    return { start, end: new Date(now.getTime() + 48 * 60 * 60 * 1000) };
  }
  if (view === "7d") {
    return { start, end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };
  }
  // deadline & late-capacity-only use 7d horizon for session discovery
  return { start, end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };
}
function standardDeadlineForSession(sessionStartsAt: Date): Date {
  const weekend = sessionStartsAt.getUTCDay() === 0 || sessionStartsAt.getUTCDay() === 6;
  if (weekend) {
    const day = sessionStartsAt.getUTCDay();
    const daysFromThursday = day === 0 ? 3 : day === 6 ? 2 : ((day - 4 + 7) % 7);
    const thursday = new Date(sessionStartsAt);
    thursday.setUTCDate(sessionStartsAt.getUTCDate() - daysFromThursday);
    const y = thursday.getUTCFullYear();
    const mo = thursday.getUTCMonth();
    const d = thursday.getUTCDate();
    return new Date(Date.UTC(y, mo, d, 18, 0, 0, 0));
  }
  const y = sessionStartsAt.getUTCFullYear();
  const mo = sessionStartsAt.getUTCMonth();
  const d = sessionStartsAt.getUTCDate();
  return new Date(Date.UTC(y, mo, d, 12, 0, 0, 0));
}
function isApproachingDeadline(sessionStartsAt: Date, now: Date): boolean {
  const windowCheck = isWithinStandardBookingWindow({ sessionStartsAt, now });
  if (windowCheck.lateBooking) return false;
  if (!windowCheck.ok) return false;
  const deadline = standardDeadlineForSession(sessionStartsAt);
  const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);
  return hoursUntilDeadline >= 0 && hoursUntilDeadline <= 48;
}
function shiftEffectiveMinutesInRange(
  shift: Pick<TutorSupportShift, "startsAt" | "endsAt" | "breakStartsAt" | "breakEndsAt">,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const overlapStart = Math.max(shift.startsAt.getTime(), rangeStart.getTime());
  const overlapEnd = Math.min(shift.endsAt.getTime(), rangeEnd.getTime());
  if (overlapEnd <= overlapStart) return 0;
  let minutes = (overlapEnd - overlapStart) / 60_000;
  if (shift.breakStartsAt && shift.breakEndsAt) {
    const breakStart = Math.max(shift.breakStartsAt.getTime(), overlapStart);
    const breakEnd = Math.min(shift.breakEndsAt.getTime(), overlapEnd);
    if (breakEnd > breakStart) {
      minutes -= (breakEnd - breakStart) / 60_000;
    }
  }
  return Math.max(0, Math.round(minutes));
}
function estimateDemandMinutes(bookingCount: number, settings: ShortLearningPolicySettings): number {
  if (bookingCount <= 0) return 0;
  return bookingCount * settings.tutorMinutesPerBooking;
}
type SlotAggregate = {
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  bookingCount: number;
  lateBooking: boolean;
};
async function loadSlotAggregates(input: {
  schoolId: string;
  view: ShortLearningView;
  now: Date;
}): Promise<{ buckets: SlotAggregate[]; rangeStart: Date; rangeEnd: Date; settings: ShortLearningPolicySettings }> {
  const settings = await getShortLearningPolicySettings(input.schoolId);
  const { start: rangeStart, end: rangeEnd } = viewRange(input.view, input.now);
  const bookings = await prisma.studentLearningBooking.findMany({
    where: {
      schoolId: input.schoolId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      startsAt: { gte: rangeStart, lt: rangeEnd },
    },
    select: {
      startsAt: true,
      endsAt: true,
      durationMinutes: true,
    },
    orderBy: { startsAt: "asc" },
  });
  const slotMap = new Map<string, SlotAggregate>();
  for (const booking of bookings) {
    const key = booking.startsAt.toISOString();
    const windowCheck = isWithinStandardBookingWindow({
      sessionStartsAt: booking.startsAt,
      now: input.now,
    });
    const existing = slotMap.get(key);
    if (existing) {
      existing.bookingCount += 1;
    } else {
      slotMap.set(key, {
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        durationMinutes: booking.durationMinutes,
        bookingCount: 1,
        lateBooking: windowCheck.lateBooking,
      });
    }
  }
  let buckets = [...slotMap.values()];
  if (input.view === "deadline") {
    buckets = buckets.filter((b) => isApproachingDeadline(b.startsAt, input.now));
  } else if (input.view === "late-capacity-only") {
    buckets = buckets.filter((b) => b.lateBooking);
  }
  return { buckets, rangeStart, rangeEnd, settings };
}
async function enrichBucketsWithCoverage(input: {
  schoolId: string;
  buckets: SlotAggregate[];
  settings: ShortLearningPolicySettings;
}): Promise<DemandBucket[]> {
  if (input.buckets.length === 0) return [];
  const minStart = input.buckets.reduce(
    (min, b) => (b.startsAt < min ? b.startsAt : min),
    input.buckets[0].startsAt,
  );
  const maxEnd = input.buckets.reduce(
    (max, b) => (b.endsAt > max ? b.endsAt : max),
    input.buckets[0].endsAt,
  );
  const shifts = await prisma.tutorSupportShift.findMany({
    where: {
      schoolId: input.schoolId,
      published: true,
      status: { not: "cancelled" },
      startsAt: { lt: maxEnd },
      endsAt: { gt: minStart },
    },
    select: {
      startsAt: true,
      endsAt: true,
      breakStartsAt: true,
      breakEndsAt: true,
    },
  });
  return input.buckets.map((slot) => {
    const estimatedTutorMinutesNeeded = estimateDemandMinutes(slot.bookingCount, input.settings);
    const publishedShiftMinutes = shifts.reduce(
      (sum, shift) => sum + shiftEffectiveMinutesInRange(shift, slot.startsAt, slot.endsAt),
      0,
    );
    const gapMinutes = Math.max(0, estimatedTutorMinutesNeeded - publishedShiftMinutes);
    return {
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      durationMinutes: slot.durationMinutes,
      bookingCount: slot.bookingCount,
      lateBooking: slot.lateBooking,
      estimatedTutorMinutesNeeded,
      publishedShiftMinutes,
      gapMinutes,
      recommendedAdditionalMinutes: gapMinutes,
    };
  });
}
export async function computeShortLearningForecast(input: {
  schoolId: string;
  view?: ShortLearningView;
  now?: Date;
}): Promise<ForecastResult> {
  const now = input.now ?? new Date();
  const view = input.view ?? "7d";
  const { buckets: aggregates, rangeStart, rangeEnd, settings } = await loadSlotAggregates({
    schoolId: input.schoolId,
    view,
    now,
  });
  const buckets = await enrichBucketsWithCoverage({
    schoolId: input.schoolId,
    buckets: aggregates,
    settings,
  });
  const totalBookings = aggregates.reduce((sum, b) => sum + b.bookingCount, 0);
  const peakBookingCount = aggregates.reduce((max, b) => Math.max(max, b.bookingCount), 0);
  return {
    view,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    totalBookings,
    peakBookingCount,
    buckets,
    settings,
  };
}
export async function computeShortLearningCoverage(input: {
  schoolId: string;
  view?: ShortLearningView;
  now?: Date;
}): Promise<CoverageResult> {
  const now = input.now ?? new Date();
  const view = input.view ?? "7d";
  const { buckets: aggregates, rangeStart, rangeEnd, settings } = await loadSlotAggregates({
    schoolId: input.schoolId,
    view,
    now,
  });
  const buckets = await enrichBucketsWithCoverage({
    schoolId: input.schoolId,
    buckets: aggregates,
    settings,
  });
  const totalBookings = aggregates.reduce((sum, b) => sum + b.bookingCount, 0);
  const totalEstimatedDemandMinutes = buckets.reduce((sum, b) => sum + b.estimatedTutorMinutesNeeded, 0);
  const totalPublishedShiftMinutes = buckets.reduce((sum, b) => sum + b.publishedShiftMinutes, 0);
  const gapMinutes = buckets.reduce((sum, b) => sum + b.gapMinutes, 0);
  return {
    view,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    totalBookings,
    totalEstimatedDemandMinutes,
    totalPublishedShiftMinutes,
    gapMinutes,
    recommendedAdditionalMinutes: gapMinutes,
    buckets,
    settings,
    note:
      "Recommendations are advisory only — publish tutor shifts manually on the Tutor Shifts page. Shifts are never auto-published.",
  };
}
export async function computeShortLearningReliability(input: {
  schoolId: string;
  now?: Date;
}): Promise<ReliabilityResult> {
  const now = input.now ?? new Date();
  const settings = await getShortLearningPolicySettings(input.schoolId);
  const lookbackStart = new Date(now.getTime() - settings.lookbackDays * 24 * 60 * 60 * 1000);
  const bookings = await prisma.studentLearningBooking.findMany({
    where: {
      schoolId: input.schoolId,
      startsAt: { gte: lookbackStart },
    },
    select: {
      parentUserId: true,
      status: true,
    },
  });
  const byParent = new Map<
    string,
    { noShowCount: number; lateCancelCount: number; totalBookings: number }
  >();
  for (const row of bookings) {
    const agg = byParent.get(row.parentUserId) ?? {
      noShowCount: 0,
      lateCancelCount: 0,
      totalBookings: 0,
    };
    agg.totalBookings += 1;
    if (row.status === "no_show") agg.noShowCount += 1;
    if (row.status === "late_cancelled") agg.lateCancelCount += 1;
    byParent.set(row.parentUserId, agg);
  }
  const parentIds = [...byParent.keys()];
  const parents = parentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const summaries: ReliabilityParentSummary[] = [];
  let restrictedParentCount = 0;
  let noShows = 0;
  let lateCancels = 0;
  for (const [parentUserId, counts] of byParent) {
    noShows += counts.noShowCount;
    lateCancels += counts.lateCancelCount;
    const restricted =
      counts.noShowCount >= settings.noShowThreshold ||
      counts.lateCancelCount >= settings.lateCancelThreshold;
    let restrictionReason: string | null = null;
    if (restricted) {
      restrictedParentCount += 1;
      const reasons: string[] = [];
      if (counts.noShowCount >= settings.noShowThreshold) {
        reasons.push(`${counts.noShowCount} no-shows (threshold ${settings.noShowThreshold})`);
      }
      if (counts.lateCancelCount >= settings.lateCancelThreshold) {
        reasons.push(
          `${counts.lateCancelCount} late cancels (threshold ${settings.lateCancelThreshold})`,
        );
      }
      restrictionReason = reasons.join("; ");
    }
    const profile = parentById.get(parentUserId);
    summaries.push({
      parentUserId,
      parentEmail: profile?.email ?? null,
      parentName: profile?.name ?? null,
      noShowCount: counts.noShowCount,
      lateCancelCount: counts.lateCancelCount,
      totalBookings: counts.totalBookings,
      restricted,
      restrictionReason,
    });
  }
  summaries.sort((a, b) => {
    const scoreA = a.noShowCount * 10 + a.lateCancelCount;
    const scoreB = b.noShowCount * 10 + b.lateCancelCount;
    return scoreB - scoreA;
  });
  const activeBookings = await prisma.studentLearningBooking.count({
    where: {
      schoolId: input.schoolId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      startsAt: { gte: now },
    },
  });
  return {
    lookbackDays: settings.lookbackDays,
    settings,
    totals: {
      noShows,
      lateCancels,
      activeBookings,
      restrictedParentCount,
    },
    parents: summaries,
  };
}
export async function listShortLearningPolicies(schoolId: string) {
  await ensureDefaultLearningWindows(schoolId);
  const [windows, policyRow, settings] = await Promise.all([
    prisma.schoolLearningWindow.findMany({
      where: { schoolId },
      orderBy: [{ weekday: "asc" }, { opensAt: "asc" }],
    }),
    prisma.schoolSupportPolicy.findUnique({ where: { schoolId } }),
    getShortLearningPolicySettings(schoolId),
  ]);
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    windows: windows.map((w) => ({
      id: w.id,
      weekday: w.weekday,
      weekdayLabel: w.weekday != null ? weekdayLabels[w.weekday] : "Override",
      opensAt: w.opensAt,
      closesAt: w.closesAt,
      allowedDurationsJson: w.allowedDurationsJson,
      startIntervalMinutes: w.startIntervalMinutes,
      timezone: w.timezone,
      capacityPerSlot: w.capacityPerSlot,
      active: w.active,
    })),
    reliability: {
      noShowThreshold: settings.noShowThreshold,
      lateCancelThreshold: settings.lateCancelThreshold,
      lookbackDays: settings.lookbackDays,
      restrictBookingDays: settings.restrictBookingDays,
    },
    coverage: {
      tutorMinutesPerBooking: settings.tutorMinutesPerBooking,
    },
    policyId: policyRow?.id ?? null,
  };
}
export async function updateShortLearningPolicies(input: {
  schoolId: string;
  windows?: Array<{
    id: string;
    opensAt?: string;
    closesAt?: string;
    capacityPerSlot?: number;
    startIntervalMinutes?: number;
    active?: boolean;
  }>;
  reliability?: Partial<
    Pick<
      ShortLearningPolicySettings,
      "noShowThreshold" | "lateCancelThreshold" | "lookbackDays" | "restrictBookingDays"
    >
  >;
  coverage?: Pick<ShortLearningPolicySettings, "tutorMinutesPerBooking">;
}) {
  await ensureDefaultLearningWindows(input.schoolId);
  if (input.windows?.length) {
    for (const patch of input.windows) {
      const existing = await prisma.schoolLearningWindow.findFirst({
        where: { id: patch.id, schoolId: input.schoolId },
      });
      if (!existing) continue;
      await prisma.schoolLearningWindow.update({
        where: { id: patch.id },
        data: {
          ...(patch.opensAt != null ? { opensAt: patch.opensAt } : {}),
          ...(patch.closesAt != null ? { closesAt: patch.closesAt } : {}),
          ...(patch.capacityPerSlot != null ? { capacityPerSlot: patch.capacityPerSlot } : {}),
          ...(patch.startIntervalMinutes != null
            ? { startIntervalMinutes: patch.startIntervalMinutes }
            : {}),
          ...(patch.active != null ? { active: patch.active } : {}),
        },
      });
    }
  }
  const policyPatch: Partial<ShortLearningPolicySettings> = {
    ...(input.reliability ?? {}),
    ...(input.coverage ?? {}),
  };
  if (Object.keys(policyPatch).length > 0) {
    await getOrCreateSupportPolicy(input.schoolId);
    const current = await prisma.schoolSupportPolicy.findUnique({
      where: { schoolId: input.schoolId },
      select: { metadataJson: true },
    });
    await prisma.schoolSupportPolicy.update({
      where: { schoolId: input.schoolId },
      data: {
        metadataJson: mergePolicyMetadata(current?.metadataJson, policyPatch),
      },
    });
  }
  return listShortLearningPolicies(input.schoolId);
}
