import { prisma } from "@/lib/db";

export type AttendanceRiskFlag = "persistent-absence" | "safeguarding-watch" | "engagement-drop" | "parent-contact-needed" | "ai-support";

export type AttendanceStudentSignal = {
  id: string;
  studentName: string;
  attendancePct: number;
  engagementScore: number;
  attendanceRiskScore: number;
  persistentAbsence: boolean;
  safeguardingLinked: boolean;
  aiConcernIndicator: string;
  parentContactPrompt: string;
  interventionRecommendation: string;
  safeguardingEscalationPrompt: string;
  classInsightImpact: string;
  riskFlags: AttendanceRiskFlag[];
};

export type AttendanceAnomaly = {
  id: string;
  title: string;
  severity: "watch" | "priority" | "critical";
  summary: string;
  intelligenceFeed: string;
  parentPrompt: string;
  safeguardingPrompt: string;
};

export type AttendanceIntervention = {
  id: string;
  studentName: string;
  focus: string;
  owner: string;
  recommendation: string;
  parentContactPrompt: string;
  aiSupportSignal: string;
  nextReview: string;
  status: "planned" | "in-progress" | "monitoring";
};

export type AttendanceIntelligenceMode = "sample" | "unavailable";

export type AttendanceOverview = {
  mode: AttendanceIntelligenceMode;
  averageAttendance: number | null;
  averageEngagement: number | null;
  highRiskCount: number;
  safeguardingLinkedCount: number;
  persistentAbsenceCount: number;
  anomalyCount: number;
  interventionCount: number;
};

/**
 * Sample fixtures for empty schools in development/demo only.
 * Never return these as live production attendance when a school has enrolments.
 */
const SAMPLE_STUDENT_SIGNALS: AttendanceStudentSignal[] = [
  {
    id: "att-1001",
    studentName: "A. Robinson",
    attendancePct: 87,
    engagementScore: 58,
    attendanceRiskScore: 82,
    persistentAbsence: true,
    safeguardingLinked: true,
    aiConcernIndicator: "Reading stamina and morning disengagement are both dropping.",
    parentContactPrompt: "Call parent today to confirm morning routine blockers and transport reliability.",
    interventionRecommendation: "Prioritise attendance mentor check-in and adaptive literacy warm-up on return.",
    safeguardingEscalationPrompt: "Escalate if two more unexplained absences occur this week.",
    classInsightImpact: "Year 5 class insight score reduced by repeated Monday absences.",
    riskFlags: ["persistent-absence", "safeguarding-watch", "parent-contact-needed", "ai-support"],
  },
  {
    id: "att-1002",
    studentName: "L. Khan",
    attendancePct: 91,
    engagementScore: 46,
    attendanceRiskScore: 76,
    persistentAbsence: false,
    safeguardingLinked: true,
    aiConcernIndicator: "Attendance recovered slightly but lesson engagement remains low after conflict incident.",
    parentContactPrompt: "Parent meeting reminder with wellbeing framing.",
    interventionRecommendation: "Blend wellbeing tutor check-in with low-load adaptive tasks for first lesson.",
    safeguardingEscalationPrompt: "Keep safeguarding concern open while attendance is volatile.",
    classInsightImpact: "Peer-conflict cluster affecting collaborative task confidence.",
    riskFlags: ["safeguarding-watch", "engagement-drop", "parent-contact-needed"],
  },
  {
    id: "att-1003",
    studentName: "M. Stewart",
    attendancePct: 95,
    engagementScore: 63,
    attendanceRiskScore: 49,
    persistentAbsence: false,
    safeguardingLinked: false,
    aiConcernIndicator: "Minor online-safety distraction pattern following evening device use.",
    parentContactPrompt: "Send brief parent nudge about device routine and homework timing.",
    interventionRecommendation: "Monitor weekly and keep AI support at light-touch alert level.",
    safeguardingEscalationPrompt: "No safeguarding escalation unless engagement and attendance both worsen.",
    classInsightImpact: "Class focus improves when home routine prompts are sent early.",
    riskFlags: ["ai-support"],
  },
  {
    id: "att-1004",
    studentName: "N. Ahmed",
    attendancePct: 89,
    engagementScore: 52,
    attendanceRiskScore: 71,
    persistentAbsence: true,
    safeguardingLinked: false,
    aiConcernIndicator: "Persistent late starts correlate with low maths confidence.",
    parentContactPrompt: "Parent contact prompt: confirm breakfast club access and morning support.",
    interventionRecommendation: "Trigger attendance intervention plus maths confidence booster pathway.",
    safeguardingEscalationPrompt: "Escalate only if attendance falls below 85% or contact attempts fail.",
    classInsightImpact: "Small-group maths insight score is being suppressed by missed starts.",
    riskFlags: ["persistent-absence", "engagement-drop", "parent-contact-needed", "ai-support"],
  },
];

const SAMPLE_ANOMALIES: AttendanceAnomaly[] = [
  {
    id: "an-1",
    title: "Monday drift in Year 5",
    severity: "priority",
    summary: "Three learners show repeated Monday absence or lateness after lower weekend learning engagement.",
    intelligenceFeed: "Feed to class insight scoring and intervention engine for Monday warm-start planning.",
    parentPrompt: "Send Sunday evening parent reminder to affected families.",
    safeguardingPrompt: "Review with DSL if unexplained absence repeats twice more.",
  },
  {
    id: "an-2",
    title: "Safeguarding-linked attendance volatility",
    severity: "critical",
    summary: "Attendance volatility overlaps with active safeguarding concern for one student and a peer-wellbeing incident for another.",
    intelligenceFeed: "Feed directly into safeguarding and AI intervention engine risk queue.",
    parentPrompt: "Route contact through safeguarding-approved script.",
    safeguardingPrompt: "Immediate DSL review required.",
  },
  {
    id: "an-3",
    title: "Low-engagement despite acceptable attendance",
    severity: "watch",
    summary: "Attendance remains above 94% for some learners, but in-class engagement scoring has fallen for 10 days.",
    intelligenceFeed: "Feed student intelligence profile before attendance is treated as stable.",
    parentPrompt: "Prompt parents to ask about effort and home learning energy, not just attendance.",
    safeguardingPrompt: "No escalation unless wellbeing indicators worsen.",
  },
];

const SAMPLE_INTERVENTIONS: AttendanceIntervention[] = [
  {
    id: "int-1",
    studentName: "A. Robinson",
    focus: "Persistent absence and safeguarding watch",
    owner: "DSL + Attendance Mentor",
    recommendation: "Daily attendance check-in, adaptive literacy entry task, and same-day home contact on unexplained absence.",
    parentContactPrompt: "Call before 10am and confirm support route.",
    aiSupportSignal: "Prioritise confidence-building content on first session back.",
    nextReview: "2026-05-27",
    status: "in-progress",
  },
  {
    id: "int-2",
    studentName: "L. Khan",
    focus: "Attendance recovery with wellbeing support",
    owner: "Deputy DSL + Tutor",
    recommendation: "Link attendance monitoring to peer-support and tutor check-in plan.",
    parentContactPrompt: "Reconfirm parent meeting and reflect attendance improvements.",
    aiSupportSignal: "Reduce challenge spikes for first two sessions each morning.",
    nextReview: "2026-05-25",
    status: "monitoring",
  },
  {
    id: "int-3",
    studentName: "N. Ahmed",
    focus: "Late-start pattern and engagement drop",
    owner: "Attendance Lead",
    recommendation: "Breakfast club referral and maths confidence intervention.",
    parentContactPrompt: "Offer transport and breakfast support information.",
    aiSupportSignal: "Switch first-task difficulty to supported mode for two weeks.",
    nextReview: "2026-05-29",
    status: "planned",
  },
];

export async function getAttendanceIntelligenceMode(schoolId: string): Promise<AttendanceIntelligenceMode> {
  const enrolled = await prisma.schoolStudent.count({
    where: { schoolId, status: "active" },
  });
  // Sample fixtures are only allowed for empty schools. Enrolled schools must not
  // see fabricated attendance as live operational data.
  return enrolled > 0 ? "unavailable" : "sample";
}

export async function getAttendanceStudentSignals(schoolId: string): Promise<AttendanceStudentSignal[]> {
  const mode = await getAttendanceIntelligenceMode(schoolId);
  return mode === "sample" ? SAMPLE_STUDENT_SIGNALS : [];
}

export async function getAttendanceAnomalies(schoolId: string): Promise<AttendanceAnomaly[]> {
  const mode = await getAttendanceIntelligenceMode(schoolId);
  return mode === "sample" ? SAMPLE_ANOMALIES : [];
}

export async function getAttendanceInterventions(schoolId: string): Promise<AttendanceIntervention[]> {
  const mode = await getAttendanceIntelligenceMode(schoolId);
  return mode === "sample" ? SAMPLE_INTERVENTIONS : [];
}

export async function getAttendanceOverview(schoolId: string): Promise<AttendanceOverview> {
  const mode = await getAttendanceIntelligenceMode(schoolId);
  if (mode === "unavailable") {
    return {
      mode,
      averageAttendance: null,
      averageEngagement: null,
      highRiskCount: 0,
      safeguardingLinkedCount: 0,
      persistentAbsenceCount: 0,
      anomalyCount: 0,
      interventionCount: 0,
    };
  }

  const students = SAMPLE_STUDENT_SIGNALS;
  const anomalies = SAMPLE_ANOMALIES;
  const interventions = SAMPLE_INTERVENTIONS;
  const averageAttendance = Math.round(students.reduce((sum, item) => sum + item.attendancePct, 0) / students.length);
  const averageEngagement = Math.round(students.reduce((sum, item) => sum + item.engagementScore, 0) / students.length);

  return {
    mode,
    averageAttendance,
    averageEngagement,
    highRiskCount: students.filter((item) => item.attendanceRiskScore >= 70).length,
    safeguardingLinkedCount: students.filter((item) => item.safeguardingLinked).length,
    persistentAbsenceCount: students.filter((item) => item.persistentAbsence).length,
    anomalyCount: anomalies.length,
    interventionCount: interventions.length,
  };
}
