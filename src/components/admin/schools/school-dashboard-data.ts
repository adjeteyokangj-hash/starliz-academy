"use client";

import { useEffect, useMemo, useState } from "react";

export type SchoolDashboardRole = "owner" | "admin" | "teacher" | "support" | "staff_observer" | "finance";

export type SchoolDashboardRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  type?: string;
  notes: string | null;
  licence: {
    status: string;
    seatLimit: number;
    seatsUsed: number;
    billingInterval: string;
    provider: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
  } | null;
  teachers: Array<{ id: string; status: string; role: string }>;
  students: Array<{ id: string; status: string; classroomId: string | null; updatedAt: string }>;
  classrooms: Array<{ id: string; status: string; studentsCount: number }>;
  safeguarding: { openAlerts: number; criticalAlerts: number };
  safeguardingIncidents: Array<{ id: string; category: string; severity: string; status: string; updatedAt: string }>;
  communicationLogs: Array<{ id: string; deliveryStatus: string; createdAt: string }>;
  activityTimeline: Array<{ id: string; action: string; severity: string; createdAt: string }>;
};

export function useSchoolDashboardRecord(schoolId: string) {
  const [school, setSchool] = useState<SchoolDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/schools", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          if (!active) return;
          setError("Unable to load school dashboard data.");
          return;
        }

        const payload = (await response.json()) as { schools?: SchoolDashboardRecord[] };
        const target = (payload.schools ?? []).find((row) => row.id === schoolId) ?? null;

        if (!active) return;
        if (!target) {
          setError("School not found.");
          setSchool(null);
          return;
        }

        setSchool(target);
      } catch {
        if (!active) return;
        setError("Unable to load school dashboard data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [schoolId]);

  return { school, loading, error };
}

export function useDerivedSchoolMetrics(school: SchoolDashboardRecord | null) {
  return useMemo(() => {
    if (!school) {
      return {
        activeTeachers: 0,
        activeStudents: 0,
        studentsWithoutClassroom: 0,
        studentTeacherRatio: 0,
        classroomCoveragePct: 0,
        deliveredCommsPct: 0,
        interventionLoad: 0,
        riskScore: 0,
        engagementScore: 0,
      };
    }

    const activeTeachers = school.teachers.filter((teacher) => teacher.status === "active").length;
    const activeStudents = school.students.filter((student) => student.status === "active").length;
    const studentsWithoutClassroom = school.students.filter((student) => student.status === "active" && !student.classroomId).length;

    const studentTeacherRatio = activeTeachers > 0 ? Number((activeStudents / activeTeachers).toFixed(1)) : activeStudents;

    const classroomCoveragePct = activeStudents > 0
      ? Math.round(((activeStudents - studentsWithoutClassroom) / activeStudents) * 100)
      : 100;

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
      studentTeacherRatio,
      classroomCoveragePct,
      deliveredCommsPct,
      interventionLoad,
      riskScore,
      engagementScore,
    };
  }, [school]);
}
