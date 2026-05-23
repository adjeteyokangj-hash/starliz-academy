export const SAFEGUARDING_STATUSES = [
  "New",
  "Triage Required",
  "Assigned",
  "Monitoring",
  "Escalated",
  "Referred",
  "Resolved",
  "Closed",
] as const;

export const SAFEGUARDING_RISK_LEVELS = ["Low", "Medium", "High", "Critical"] as const;

export type SafeguardingStatus = (typeof SAFEGUARDING_STATUSES)[number];
export type SafeguardingRiskLevel = (typeof SAFEGUARDING_RISK_LEVELS)[number];

export type SafeguardingIncidentRecord = {
  id: string;
  schoolId: string;
  student: string;
  concernType: string;
  riskLevel: SafeguardingRiskLevel;
  reportedBy: string;
  reportedAt: string;
  concernSummary: string;
  immediateActionTaken: string;
  assignedOwner: string;
  status: SafeguardingStatus;
  nextReviewDate: string;
  parentContacted: boolean;
  externalAgencyInvolved: boolean;
  chronologyNotes: string;
  closureSummary: string;
  parentContactNotes: string;
  agencyReferralStatus: "Not Referred" | "Referral Drafted" | "Referred" | "Agency Response Received";
  auditTrail: string[];
};

export type SafeguardingTimelineEvent = {
  id: string;
  incidentId: string;
  timestamp: string;
  actor: string;
  action: string;
  note: string;
};

const INCIDENTS: Omit<SafeguardingIncidentRecord, "schoolId">[] = [
  {
    id: "inc-1001",
    student: "A. Robinson",
    concernType: "Attendance and unexplained absence",
    riskLevel: "Medium",
    reportedBy: "Class Teacher - J. Patel",
    reportedAt: "2026-05-20T09:10:00.000Z",
    concernSummary: "Three consecutive unexplained absences with low parent response.",
    immediateActionTaken: "Attendance call attempted; concern logged and triage flagged.",
    assignedOwner: "DSL - R. Morgan",
    status: "Triage Required",
    nextReviewDate: "2026-05-25",
    parentContacted: true,
    externalAgencyInvolved: false,
    chronologyNotes: "Pattern noted across two weeks. Tutor raised additional concern on punctuality drift.",
    closureSummary: "",
    parentContactNotes: "Left voicemail and sent follow-up email to guardian.",
    agencyReferralStatus: "Not Referred",
    auditTrail: [
      "Created by Class Teacher - J. Patel at 2026-05-20 09:10",
      "Status set to Triage Required by DSL Queue at 2026-05-20 09:12",
    ],
  },
  {
    id: "inc-1002",
    student: "L. Khan",
    concernType: "Wellbeing disclosure",
    riskLevel: "High",
    reportedBy: "Teaching Assistant - N. Green",
    reportedAt: "2026-05-19T11:40:00.000Z",
    concernSummary: "Student disclosed distress linked to persistent peer conflict.",
    immediateActionTaken: "Student moved to supervised safe space; DSL informed immediately.",
    assignedOwner: "Deputy DSL - K. James",
    status: "Escalated",
    nextReviewDate: "2026-05-24",
    parentContacted: true,
    externalAgencyInvolved: true,
    chronologyNotes: "Initial disclosure recorded. Peer safeguarding review started.",
    closureSummary: "",
    parentContactNotes: "Parent meeting arranged for 2026-05-23.",
    agencyReferralStatus: "Referral Drafted",
    auditTrail: [
      "Created by Teaching Assistant - N. Green at 2026-05-19 11:40",
      "Assigned to Deputy DSL - K. James at 2026-05-19 11:52",
      "Escalated by Deputy DSL - K. James at 2026-05-19 12:10",
    ],
  },
  {
    id: "inc-1003",
    student: "M. Stewart",
    concernType: "Online safety concern",
    riskLevel: "Low",
    reportedBy: "Parent Liaison Officer - E. Lewis",
    reportedAt: "2026-05-18T15:05:00.000Z",
    concernSummary: "Parent reported exposure to inappropriate group chat content.",
    immediateActionTaken: "Digital safety guidance provided and device check scheduled.",
    assignedOwner: "Head Teacher - A. Morgan",
    status: "Monitoring",
    nextReviewDate: "2026-05-27",
    parentContacted: true,
    externalAgencyInvolved: false,
    chronologyNotes: "Family cooperative, no immediate escalation threshold met.",
    closureSummary: "",
    parentContactNotes: "Guidance pack sent; follow-up call confirmed actions taken at home.",
    agencyReferralStatus: "Not Referred",
    auditTrail: [
      "Created by Parent Liaison Officer - E. Lewis at 2026-05-18 15:05",
      "Monitoring plan recorded by Head Teacher - A. Morgan at 2026-05-18 15:40",
    ],
  },
];

const TIMELINE: SafeguardingTimelineEvent[] = [
  {
    id: "tm-1",
    incidentId: "inc-1001",
    timestamp: "2026-05-20T09:10:00.000Z",
    actor: "Class Teacher - J. Patel",
    action: "Concern raised",
    note: "Absence trend concern logged.",
  },
  {
    id: "tm-2",
    incidentId: "inc-1002",
    timestamp: "2026-05-19T11:52:00.000Z",
    actor: "DSL Office",
    action: "Owner assigned",
    note: "Assigned to Deputy DSL - K. James.",
  },
  {
    id: "tm-3",
    incidentId: "inc-1002",
    timestamp: "2026-05-19T12:10:00.000Z",
    actor: "Deputy DSL - K. James",
    action: "Escalation initiated",
    note: "Escalation workflow opened with referral draft.",
  },
  {
    id: "tm-4",
    incidentId: "inc-1003",
    timestamp: "2026-05-18T16:10:00.000Z",
    actor: "Head Teacher - A. Morgan",
    action: "Monitoring updated",
    note: "Weekly review checkpoint scheduled.",
  },
];

export function getSafeguardingIncidentsForSchool(schoolId: string): SafeguardingIncidentRecord[] {
  return INCIDENTS.map((incident) => ({ ...incident, schoolId }));
}

export function getSafeguardingIncidentById(schoolId: string, incidentId: string): SafeguardingIncidentRecord | null {
  return getSafeguardingIncidentsForSchool(schoolId).find((incident) => incident.id === incidentId) ?? null;
}

export function getSafeguardingTimelineByIncident(incidentId: string): SafeguardingTimelineEvent[] {
  return TIMELINE.filter((event) => event.incidentId === incidentId).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
