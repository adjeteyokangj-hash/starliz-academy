/**
 * Platform and school-scoped Short Learning oversight (read-only).
 * Does not publish shifts or mutate bookings.
 */

import type { StudentLearningBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SHORT_LEARNING_PROMISE } from "@/lib/schools/short-learning-bookings";
import { computeShortLearningCoverage } from "@/lib/schools/short-learning-coverage";

const ALL_STATUSES: StudentLearningBookingStatus[] = [
  "booked",
  "confirmed",
  "attended",
  "completed",
  "cancelled",
  "late_cancelled",
  "no_show",
  "expired",
];

export type BookingCountsByStatus = Record<StudentLearningBookingStatus, number>;

export type SchoolShortLearningOversightRow = {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  todayByStatus: BookingCountsByStatus;
  upcomingByStatus: BookingCountsByStatus;
  todayTotal: number;
  upcomingTotal: number;
  publishedShiftsNext48h: number;
  coverageGapMinutes: number;
  coverageBookings48h: number;
  bucketsWithGap: number;
  hasBookings: boolean;
  hasShifts: boolean;
};

export type AdminShortLearningOversight = {
  generatedAt: string;
  promise: string;
  scope: "platform" | "school";
  schoolId: string | null;
  range48hEnd: string;
  summary: {
    schoolsWithActivity: number;
    todayTotal: number;
    upcomingTotal: number;
    todayByStatus: BookingCountsByStatus;
    upcomingByStatus: BookingCountsByStatus;
    publishedShiftsNext48h: number;
    totalCoverageGapMinutes: number;
    totalCoverageBookings48h: number;
    schoolsWithCoverageGap: number;
  };
  schools: SchoolShortLearningOversightRow[];
};

function emptyStatusCounts(): BookingCountsByStatus {
  return ALL_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as BookingCountsByStatus);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addStatusCounts(target: BookingCountsByStatus, source: BookingCountsByStatus): void {
  for (const status of ALL_STATUSES) {
    target[status] += source[status];
  }
}

function sumStatusCounts(counts: BookingCountsByStatus): number {
  return ALL_STATUSES.reduce((sum, status) => sum + counts[status], 0);
}

async function loadBookingCounts(input: {
  schoolIds: string[];
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<Map<string, BookingCountsByStatus>> {
  const bySchool = new Map<string, BookingCountsByStatus>();
  if (input.schoolIds.length === 0) return bySchool;

  const rows = await prisma.studentLearningBooking.groupBy({
    by: ["schoolId", "status"],
    where: {
      schoolId: { in: input.schoolIds },
      startsAt: { gte: input.rangeStart, lt: input.rangeEnd },
    },
    _count: { _all: true },
  });

  for (const schoolId of input.schoolIds) {
    bySchool.set(schoolId, emptyStatusCounts());
  }

  for (const row of rows) {
    const counts = bySchool.get(row.schoolId) ?? emptyStatusCounts();
    const status = row.status as StudentLearningBookingStatus;
    if (ALL_STATUSES.includes(status)) {
      counts[status] = row._count._all;
    }
    bySchool.set(row.schoolId, counts);
  }

  return bySchool;
}

async function loadPublishedShiftCounts(input: {
  schoolIds: string[];
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (input.schoolIds.length === 0) return counts;

  const rows = await prisma.tutorSupportShift.groupBy({
    by: ["schoolId"],
    where: {
      schoolId: { in: input.schoolIds },
      published: true,
      status: { not: "cancelled" },
      startsAt: { lt: input.rangeEnd },
      endsAt: { gt: input.rangeStart },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    counts.set(row.schoolId, row._count._all);
  }
  return counts;
}

async function loadActiveSchoolIds(input: {
  todayStart: Date;
  todayEnd: Date;
  upcomingStart: Date;
  range48hEnd: Date;
  filterSchoolId?: string;
}): Promise<string[]> {
  const schoolFilter = input.filterSchoolId ? { schoolId: input.filterSchoolId } : {};

  const [bookingSchools, shiftSchools] = await Promise.all([
    prisma.studentLearningBooking.findMany({
      where: {
        ...schoolFilter,
        OR: [
          { startsAt: { gte: input.todayStart, lt: input.todayEnd } },
          { startsAt: { gte: input.upcomingStart } },
        ],
      },
      select: { schoolId: true },
      distinct: ["schoolId"],
    }),
    prisma.tutorSupportShift.findMany({
      where: {
        ...schoolFilter,
        published: true,
        status: { not: "cancelled" },
        startsAt: { lt: input.range48hEnd },
        endsAt: { gt: input.upcomingStart },
      },
      select: { schoolId: true },
      distinct: ["schoolId"],
    }),
  ]);

  const ids = new Set<string>();
  for (const row of bookingSchools) ids.add(row.schoolId);
  for (const row of shiftSchools) ids.add(row.schoolId);

  if (input.filterSchoolId && ids.size === 0) {
    const school = await prisma.school.findUnique({
      where: { id: input.filterSchoolId },
      select: { id: true },
    });
    if (school) ids.add(school.id);
  }

  return [...ids];
}

export async function getAdminShortLearningOversight(input?: {
  schoolId?: string;
  now?: Date;
}): Promise<AdminShortLearningOversight | null> {
  const now = input?.now ?? new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const upcomingStart = now;
  const range48hEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const activeSchoolIds = await loadActiveSchoolIds({
    todayStart,
    todayEnd,
    upcomingStart,
    range48hEnd,
    filterSchoolId: input?.schoolId,
  });

  if (activeSchoolIds.length === 0) {
    return {
      generatedAt: now.toISOString(),
      promise: SHORT_LEARNING_PROMISE,
      scope: input?.schoolId ? "school" : "platform",
      schoolId: input?.schoolId ?? null,
      range48hEnd: range48hEnd.toISOString(),
      summary: {
        schoolsWithActivity: 0,
        todayTotal: 0,
        upcomingTotal: 0,
        todayByStatus: emptyStatusCounts(),
        upcomingByStatus: emptyStatusCounts(),
        publishedShiftsNext48h: 0,
        totalCoverageGapMinutes: 0,
        totalCoverageBookings48h: 0,
        schoolsWithCoverageGap: 0,
      },
      schools: [],
    };
  }

  const schoolsMeta = await prisma.school.findMany({
    where: { id: { in: activeSchoolIds } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  const [todayBySchool, upcomingBySchool, shiftsBySchool] = await Promise.all([
    loadBookingCounts({
      schoolIds: activeSchoolIds,
      rangeStart: todayStart,
      rangeEnd: todayEnd,
    }),
    loadBookingCounts({
      schoolIds: activeSchoolIds,
      rangeStart: upcomingStart,
      rangeEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    }),
    loadPublishedShiftCounts({
      schoolIds: activeSchoolIds,
      rangeStart: upcomingStart,
      rangeEnd: range48hEnd,
    }),
  ]);

  const coverageResults = await Promise.all(
    activeSchoolIds.map(async (schoolId) => {
      const coverage = await computeShortLearningCoverage({ schoolId, view: "48h", now });
      return {
        schoolId,
        gapMinutes: coverage.gapMinutes,
        bookings48h: coverage.totalBookings,
        bucketsWithGap: coverage.buckets.filter((b) => b.gapMinutes > 0).length,
      };
    }),
  );
  const coverageBySchool = new Map(coverageResults.map((row) => [row.schoolId, row]));

  const schools: SchoolShortLearningOversightRow[] = schoolsMeta.map((school) => {
    const todayByStatus = todayBySchool.get(school.id) ?? emptyStatusCounts();
    const upcomingByStatus = upcomingBySchool.get(school.id) ?? emptyStatusCounts();
    const todayTotal = sumStatusCounts(todayByStatus);
    const upcomingTotal = sumStatusCounts(upcomingByStatus);
    const publishedShiftsNext48h = shiftsBySchool.get(school.id) ?? 0;
    const coverage = coverageBySchool.get(school.id);
    const hasBookings = todayTotal > 0 || upcomingTotal > 0;

    return {
      schoolId: school.id,
      schoolName: school.name,
      schoolSlug: school.slug,
      todayByStatus,
      upcomingByStatus,
      todayTotal,
      upcomingTotal,
      publishedShiftsNext48h,
      coverageGapMinutes: coverage?.gapMinutes ?? 0,
      coverageBookings48h: coverage?.bookings48h ?? 0,
      bucketsWithGap: coverage?.bucketsWithGap ?? 0,
      hasBookings,
      hasShifts: publishedShiftsNext48h > 0,
    };
  });

  const summaryToday = emptyStatusCounts();
  const summaryUpcoming = emptyStatusCounts();
  let publishedShiftsNext48h = 0;
  let totalCoverageGapMinutes = 0;
  let totalCoverageBookings48h = 0;
  let schoolsWithCoverageGap = 0;
  let schoolsWithActivity = 0;

  for (const row of schools) {
    addStatusCounts(summaryToday, row.todayByStatus);
    addStatusCounts(summaryUpcoming, row.upcomingByStatus);
    publishedShiftsNext48h += row.publishedShiftsNext48h;
    totalCoverageGapMinutes += row.coverageGapMinutes;
    totalCoverageBookings48h += row.coverageBookings48h;
    if (row.coverageGapMinutes > 0) schoolsWithCoverageGap += 1;
    if (row.hasBookings || row.hasShifts) schoolsWithActivity += 1;
  }

  const activeOnly = schools.filter((row) => row.hasBookings || row.hasShifts);
  const visibleSchools =
    input?.schoolId && activeOnly.length === 0 && schools.length === 1 ? schools : activeOnly;

  return {
    generatedAt: now.toISOString(),
    promise: SHORT_LEARNING_PROMISE,
    scope: input?.schoolId ? "school" : "platform",
    schoolId: input?.schoolId ?? null,
    range48hEnd: range48hEnd.toISOString(),
    summary: {
      schoolsWithActivity,
      todayTotal: sumStatusCounts(summaryToday),
      upcomingTotal: sumStatusCounts(summaryUpcoming),
      todayByStatus: summaryToday,
      upcomingByStatus: summaryUpcoming,
      publishedShiftsNext48h,
      totalCoverageGapMinutes,
      totalCoverageBookings48h,
      schoolsWithCoverageGap,
    },
    schools: visibleSchools,
  };
}
