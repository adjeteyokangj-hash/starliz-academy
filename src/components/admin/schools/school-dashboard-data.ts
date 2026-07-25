"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SchoolDashboardRole = "owner" | "admin" | "teacher" | "support" | "staff_observer" | "finance";

export type SchoolDashboardRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  type?: string;
  notes: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  updatedAt?: string;
  licence: {
    status: string;
    seatLimit: number;
    seatsUsed: number;
    seatsAvailable?: number;
    billingInterval: string;
    provider: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
  } | null;
  teachers: Array<{
    id: string;
    userId?: string;
    email?: string;
    name?: string | null;
    status: string;
    role: string;
    title?: string | null;
    invitedAt?: string | null;
    acceptedAt?: string | null;
    lastActiveAt?: string | null;
    updatedAt?: string;
  }>;
  students: Array<{
    id: string;
    childId?: string;
    childName?: string;
    parentEmail?: string;
    status: string;
    classroomId: string | null;
    classroomName?: string | null;
    externalRef?: string | null;
    joinedAt?: string;
    updatedAt: string;
  }>;
  classrooms: Array<{
    id: string;
    name?: string;
    yearGroup?: string | null;
    academicYear?: string | null;
    status: string;
    teacherId?: string | null;
    teacherName?: string | null;
    studentsCount: number;
    updatedAt?: string;
  }>;
  safeguarding: { openAlerts: number; criticalAlerts: number };
  safeguardingIncidents: Array<{
    id: string;
    category: string;
    severity: string;
    status: string;
    studentName?: string | null;
    updatedAt: string;
  }>;
  communicationLogs: Array<{ id: string; deliveryStatus: string; createdAt: string }>;
  activityTimeline: Array<{ id: string; action: string; severity: string; createdAt: string }>;
  dayLessons: Array<{
    id: string;
    title: string;
    subject: string;
    lessonType: string;
    yearGroup: string | null;
    keyStage: string | null;
    skillFocus: string | null;
    dayOfWeek: number;
    periodIndex: number;
    startsAt: string;
    endsAt: string;
    room: string | null;
    status: string;
    classroomId: string | null;
    classroomName: string | null;
    teacherId: string | null;
    teacherName: string | null;
    lessonId: string | null;
    lessonTitle?: string | null;
    dueDate: string | null;
    updatedAt: string;
    playableContent?: {
      id: string;
      contentType: string;
      topic: string;
      skillFocus: string | null;
      status: string;
      itemCount: number;
      yearGroup: string | null;
      estimatedMinutes?: number | null;
      stage?: string | null;
      stageLabel?: string | null;
    } | null;
    playableSession?: {
      periodMinutes: number;
      totalEstimatedMinutes: number;
      stageCount: number;
      contentType: string | null;
      stages: Array<{
        id: string;
        contentType: string;
        topic: string;
        status: string;
        itemCount: number;
        estimatedMinutes: number;
        stage: string;
        stageLabel: string;
        preview: {
          headline: string | null;
          body: string | null;
          items: string[];
        };
      }>;
    } | null;
    lessonReview?: {
      reviewStatus: "draft" | "machine_failed" | "awaiting_review" | "approved";
      teacherReviewedAt: string | null;
      teacherReviewedBy: string | null;
      machineHealth: {
        overall: "PASS" | "FAIL";
        checkedAt: string;
        periodMinutes: number;
        totalEstimatedMinutes: number;
        stageCount: number;
        checks: Array<{ id: string; label: string; passed: boolean; detail?: string }>;
        reason: string | null;
        regenerateHint: string | null;
      } | null;
    } | null;
  }>;
};

type SchoolDashboardContextValue = {
  schoolId: string;
  school: SchoolDashboardRecord | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const SchoolDashboardContext = createContext<SchoolDashboardContextValue | null>(null);

async function fetchSchoolDashboardRecord(schoolId: string): Promise<SchoolDashboardRecord> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`/api/admin/school-dashboard/${schoolId}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 404) {
      throw new Error("School not found.");
    }
    if (!response.ok) {
      throw new Error("Unable to load school dashboard data.");
    }
    const payload = (await response.json()) as { school?: SchoolDashboardRecord };
    if (!payload.school) {
      throw new Error("School not found.");
    }
    return {
      ...payload.school,
      dayLessons: payload.school.dayLessons ?? [],
    };
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new Error("School profile load timed out. Retry in a moment.");
    }
    throw cause;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function SchoolDashboardProvider({
  schoolId,
  children,
}: {
  schoolId: string;
  children: ReactNode;
}) {
  const [school, setSchool] = useState<SchoolDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchSchoolDashboardRecord(schoolId);
        if (!active) return;
        setSchool(next);
      } catch (cause) {
        if (!active) return;
        setSchool(null);
        setError(cause instanceof Error ? cause.message : "Unable to load school dashboard data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [schoolId, reloadToken]);

  const value = useMemo<SchoolDashboardContextValue>(() => ({
    schoolId,
    school,
    loading,
    error,
    refresh: () => setReloadToken((token) => token + 1),
  }), [schoolId, school, loading, error]);

  return createElement(SchoolDashboardContext.Provider, { value }, children);
}

export function useSchoolDashboardRecord(schoolId: string) {
  const context = useContext(SchoolDashboardContext);
  const [school, setSchool] = useState<SchoolDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasMatchingContext = Boolean(context && context.schoolId === schoolId);

  useEffect(() => {
    if (hasMatchingContext) return;

    let active = true;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchSchoolDashboardRecord(schoolId);
        if (!active) return;
        setSchool(next);
      } catch (cause) {
        if (!active) return;
        setSchool(null);
        setError(cause instanceof Error ? cause.message : "Unable to load school dashboard data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [schoolId, hasMatchingContext]);

  if (hasMatchingContext && context) {
    return {
      school: context.school,
      loading: context.loading,
      error: context.error,
      refresh: context.refresh,
    };
  }

  return { school, loading, error, refresh: () => undefined };
}

export function useDerivedSchoolMetrics(school: SchoolDashboardRecord | null) {
  return useMemo(() => {
    if (!school) {
      return {
        activeTeachers: 0,
        activeStudents: 0,
        studentsWithoutClassroom: 0,
        inactiveTeachers: 0,
        studentTeacherRatio: 0,
        classroomCoveragePct: 0,
        licenceUtilisationPct: 0,
        deliveredCommsPct: 0,
        interventionLoad: 0,
        riskScore: 0,
        engagementScore: 0,
        recentAuditEvents24h: 0,
      };
    }

    const activeTeachers = school.teachers.filter((teacher) => teacher.status === "active").length;
    const inactiveTeachers = school.teachers.filter((teacher) => teacher.status !== "active").length;
    const activeStudents = school.students.filter((student) => student.status === "active").length;
    const studentsWithoutClassroom = school.students.filter((student) => student.status === "active" && !student.classroomId).length;

    const studentTeacherRatio = activeTeachers > 0 ? Number((activeStudents / activeTeachers).toFixed(1)) : activeStudents;

    const classroomCoveragePct = activeStudents > 0
      ? Math.round(((activeStudents - studentsWithoutClassroom) / activeStudents) * 100)
      : 100;

    const seatLimit = school.licence?.seatLimit ?? 0;
    const seatsUsed = school.licence?.seatsUsed ?? activeStudents;
    const licenceUtilisationPct = seatLimit > 0
      ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100))
      : 0;

    const deliveredLogs = school.communicationLogs.filter((log) => log.deliveryStatus === "delivered").length;
    const deliveredCommsPct = school.communicationLogs.length
      ? Math.round((deliveredLogs / school.communicationLogs.length) * 100)
      : 100;

    const openIncidents = school.safeguardingIncidents.filter((incident) => {
      const status = incident.status.toLowerCase();
      return status === "open" || status === "under_review" || status === "escalated";
    }).length;

    const interventionLoad = school.safeguarding.openAlerts + openIncidents + studentsWithoutClassroom;

    const riskScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          school.safeguarding.criticalAlerts * 20
            + school.safeguarding.openAlerts * 8
            + openIncidents * 6
            + studentsWithoutClassroom * 3
            + (school.status === "suspended" ? 20 : 0),
        ),
      ),
    );

    const timelineTimes = school.activityTimeline.map((item) => new Date(item.createdAt).getTime());
    const nowMs = school.updatedAt
      ? new Date(school.updatedAt).getTime()
      : Math.max(0, ...timelineTimes);
    const dayMs = 1000 * 60 * 60 * 24;
    const recentAuditEvents24h = school.activityTimeline.filter((item) => {
      return nowMs - new Date(item.createdAt).getTime() <= dayMs;
    }).length;

    const referenceTimestampMs = Math.max(
      ...school.activityTimeline.map((item) => new Date(item.createdAt).getTime()),
      0,
    );
    const recentCutoffMs = referenceTimestampMs - (1000 * 60 * 60 * 24 * 14);

    const recentActivity = school.activityTimeline.filter((item) => {
      return new Date(item.createdAt).getTime() >= recentCutoffMs;
    }).length;

    const engagementScore = Math.max(
      0,
      Math.min(
        100,
        Math.round((activeStudents ? (recentActivity / activeStudents) * 30 : 50) + deliveredCommsPct * 0.35 + classroomCoveragePct * 0.35),
      ),
    );

    return {
      activeTeachers,
      activeStudents,
      studentsWithoutClassroom,
      inactiveTeachers,
      studentTeacherRatio,
      classroomCoveragePct,
      licenceUtilisationPct,
      deliveredCommsPct,
      interventionLoad,
      riskScore,
      engagementScore,
      recentAuditEvents24h,
    };
  }, [school]);
}
