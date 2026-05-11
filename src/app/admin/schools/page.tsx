
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { OpsLiveSnapshot, OpsLiveTransport, startOpsLiveBridge } from "@/lib/schools/ops-live-bridge";
import ProvisioningSuccessScreenV2 from "@/components/admin/ProvisioningSuccessScreenV2";
import DynamicScoringDashboard from "@/components/admin/DynamicScoringDashboard";

type SchoolRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  licence: {
    id: string;
    status: string;
    seatLimit: number;
    seatsUsed: number;
    seatsAvailable: number;
    provider: string;
    pricingPlanId: string | null;
    currency: string;
    billingInterval: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    startsAt: string | null;
    endsAt: string | null;
    notes: string | null;
    updatedAt: string;
  } | null;
  classrooms: Array<{
    id: string;
    name: string;
    yearGroup: string | null;
    academicYear: string | null;
    status: string;
    teacherId: string | null;
    teacherName: string | null;
    studentsCount: number;
    updatedAt: string;
  }>;
  teachers: Array<{
    id: string;
    userId: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    title: string | null;
    invitedAt: string | null;
    acceptedAt: string | null;
    lastActiveAt: string | null;
    updatedAt: string;
  }>;
  students: Array<{
    id: string;
    childId: string;
    childName: string;
    parentEmail: string;
    classroomId: string | null;
    classroomName: string | null;
    status: string;
    externalRef: string | null;
    joinedAt: string;
    updatedAt: string;
  }>;
  communicationPreferences: Array<{
    linkId: string;
    parentName: string | null;
    parentEmail: string;
    studentName: string;
    optedOutAt: string | null;
    optOutReason: string | null;
    safeguardingLockedAt: string | null;
    safeguardingLockReason: string | null;
    updatedAt: string;
  }>;
  communicationLogs: Array<{
    id: string;
    subject: string;
    messageBody: string;
    deliveryStatus: string;
    deliveryReason: string | null;
    parentEmail: string;
    studentName: string;
    actorName: string | null;
    createdAt: string;
  }>;
  safeguarding: {
    openAlerts: number;
    criticalAlerts: number;
  };
  safeguardingIncidents: Array<{
    id: string;
    category: string;
    severity: string;
    status: string;
    studentName: string | null;
    escalationLevel: string | null;
    reportedBy: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  activityTimeline: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    severity: string;
    actorUserId: string | null;
    createdAt: string;
  }>;
};

type StudentOption = {
  id: string;
  name: string;
  parentEmail: string;
};

type QuickFilterKey =
  | "licenceRisk"
  | "safeguardingRisk"
  | "suspendedSchools"
  | "seatCapacity"
  | "noActiveTeachers"
  | "expiringLicences";

type QuickFilterState = Record<QuickFilterKey, boolean>;

type SavedViewName =
  | "Morning Risk Sweep"
  | "Safeguarding Queue"
  | "Licence Renewal Watch"
  | "Staffing Gaps"
  | "Compliance Actions"
  | "High-Risk Schools";

type OwnershipRecord = {
  reviewer: string;
  safeguardingLead: string;
  complianceOfficer: string;
};

type SavedOperationalView = {
  name: SavedViewName;
  filters: QuickFilterState;
  focus: "dashboard" | "teachers" | "safeguarding" | "communication" | "exports";
  description: string;
  filtersApplied: string[];
};

type ToastItem = {
  id: number;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
};

type AuditTrailEntry = {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  severity: string;
  actorUserId: string | null;
  source: string | null;
  operation: string | null;
};

type SchoolAuditApiItem = {
  id: string;
  createdAt: string;
  action: string;
  severity: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  source: string | null;
  operation: string | null;
};

type ProvisioningStepRunRecord = {
  id: string;
  stepKey: string;
  status: string;
  attempt: number;
  durationMs: number | null;
  errorJson: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type ProvisioningJobRecord = {
  id: string;
  schoolId: string;
  status: string;
  priority: string;
  attemptCount: number;
  maxAttempts: number;
  errorJson: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  nextRetryAt: string | null;
  stepRuns: ProvisioningStepRunRecord[];
};

type TrustRecord = {
  id: string;
  name: string;
  code: string;
  headquartersRegion: string | null;
  status: string;
  _count?: {
    schoolMemberships: number;
    adminMemberships: number;
    bulkBatches: number;
  };
};

type BulkBatchRecord = {
  id: string;
  trustId: string | null;
  status: string;
  sourceType: string;
  dryRun: boolean;
  totalRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
};

type NotificationPreferenceRecord = {
  id: string;
  eventType: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  minSeverity: "info" | "warning" | "critical";
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
};

type NotificationDeliveryRecord = {
  id: string;
  channel: string;
  status: string;
  recipient: string;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
};

type NotificationEventRecord = {
  id: string;
  eventType: string;
  severity: string;
  status: string;
  dedupeKey: string | null;
  createdAt: string;
  deliveries: NotificationDeliveryRecord[];
};

type Recommendation = {
  id: string;
  title: string;
  description: string;
  category: "profile" | "governance" | "launch" | "contact";
  priority: "low" | "medium" | "high" | "critical";
  fieldToFix?: string;
};

type CreateWizardField =
  | "createName"
  | "createEmail"
  | "createPhone"
  | "createPriority"
  | "createRegion"
  | "createRegionComplianceProfile"
  | "createCommunicationPreferences"
  | "createParentOnboardingMode"
  | "createRetentionStrategy"
  | "createEscalationChain"
  | "createSafeguardingWorkflow"
  | "createApprovalWorkflow"
  | "createLaunchTarget"
  | "createOnboardingBrief"
  | "createSafeguardingLead"
  | "createDslContact"
  | "createDataRetention";

function isoToDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
}

function shortDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  if (diff < 60 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h`;
  return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const ORG_TYPE_LABELS: Record<string, string> = {
  school: "School",
  tutoring_centre: "Tutoring Centre",
  organisation: "Organisation",
};

const SCHOOL_STATUS_LABELS: Record<string, string> = {
  pilot: "Pilot",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
};

const LICENCE_STATUS_LABELS: Record<string, string> = {
  pilot: "Pilot",
  active: "Active",
  trialing: "Trialing",
  past_due: "Past Due",
  cancelled: "Cancelled",
  suspended: "Suspended",
};

function badgeClass(status: string): string {
  switch (status) {
    case "active":
    case "sent":
    case "succeeded":
    case "completed":
    case "delivered":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";
    case "pilot":
    case "trialing":
    case "queued":
    case "pending":
    case "running":
      return "border-sky-500/30 bg-sky-500/15 text-sky-200";
    case "suspended":
    case "past_due":
    case "retry_scheduled":
    case "warning":
      return "border-amber-500/30 bg-amber-500/15 text-amber-200";
    case "archived":
    case "cancelled":
    case "info":
      return "border-slate-500/30 bg-slate-500/15 text-slate-200";
    default:
      return "border-rose-500/30 bg-rose-500/15 text-rose-200";
  }
}

function typeLabel(value: string): string {
  return ORG_TYPE_LABELS[value] ?? value;
}

function schoolStatusLabel(value: string): string {
  return SCHOOL_STATUS_LABELS[value] ?? value;
}

function licenceStatusLabel(value: string): string {
  return LICENCE_STATUS_LABELS[value] ?? value;
}

type EscalationSeverity = "Low" | "Medium" | "High" | "Critical";

type EscalationSignal = {
  label: string;
  severity: EscalationSeverity;
};

const SEVERITY_WEIGHT: Record<EscalationSeverity, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

function severityClass(level: EscalationSeverity): string {
  switch (level) {
    case "Critical":
      return "border-rose-500/40 bg-rose-500/20 text-rose-100";
    case "High":
      return "border-amber-500/40 bg-amber-500/20 text-amber-100";
    case "Medium":
      return "border-sky-500/40 bg-sky-500/20 text-sky-100";
    default:
      return "border-emerald-500/40 bg-emerald-500/20 text-emerald-100";
  }
}

function initialsFromSchool(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? "S"}${parts[1][0] ?? "C"}`.toUpperCase();
}

const QUICK_FILTERS: Array<{ key: QuickFilterKey; label: string }> = [
  { key: "licenceRisk", label: "Licence Risk" },
  { key: "safeguardingRisk", label: "Safeguarding Risk" },
  { key: "suspendedSchools", label: "Suspended Schools" },
  { key: "seatCapacity", label: "Seat Capacity" },
  { key: "noActiveTeachers", label: "No Active Teachers" },
  { key: "expiringLicences", label: "Expiring Licences" },
];

const DEFAULT_QUICK_FILTERS: QuickFilterState = {
  licenceRisk: false,
  safeguardingRisk: false,
  suspendedSchools: false,
  seatCapacity: false,
  noActiveTeachers: false,
  expiringLicences: false,
};

const SAVED_OPERATIONAL_VIEWS: SavedOperationalView[] = [
  {
    name: "Morning Risk Sweep",
    filters: { ...DEFAULT_QUICK_FILTERS, licenceRisk: true, safeguardingRisk: true, expiringLicences: true },
    focus: "dashboard",
    description: "Run the opening-day risk scan across licence, safeguarding, and expiring contracts.",
    filtersApplied: ["Licence Risk", "Safeguarding Risk", "Expiring Licences"],
  },
  {
    name: "Safeguarding Queue",
    filters: { ...DEFAULT_QUICK_FILTERS, safeguardingRisk: true },
    focus: "safeguarding",
    description: "Prioritize safeguarding interventions and unresolved incidents.",
    filtersApplied: ["Safeguarding Risk"],
  },
  {
    name: "Licence Renewal Watch",
    filters: { ...DEFAULT_QUICK_FILTERS, expiringLicences: true, licenceRisk: true },
    focus: "dashboard",
    description: "Track licences nearing renewal and schools currently in licensing risk.",
    filtersApplied: ["Expiring Licences", "Licence Risk"],
  },
  {
    name: "Staffing Gaps",
    filters: { ...DEFAULT_QUICK_FILTERS, noActiveTeachers: true },
    focus: "teachers",
    description: "Identify schools with no active teaching coverage.",
    filtersApplied: ["No Active Teachers"],
  },
  {
    name: "Compliance Actions",
    filters: { ...DEFAULT_QUICK_FILTERS, licenceRisk: true, suspendedSchools: true },
    focus: "exports",
    description: "Focus on suspended schools and compliance-sensitive escalations.",
    filtersApplied: ["Licence Risk", "Suspended Schools"],
  },
  {
    name: "High-Risk Schools",
    filters: { ...DEFAULT_QUICK_FILTERS, safeguardingRisk: true, seatCapacity: true, noActiveTeachers: true },
    focus: "dashboard",
    description: "Composite risk mode for safeguarding, staffing, and capacity constraints.",
    filtersApplied: ["Safeguarding Risk", "Seat Capacity", "No Active Teachers"],
  },
];

const OPS_SAVED_VIEW_KEY = "starliz_ops_saved_view";
const OPS_OWNERSHIP_KEY = "starliz_ops_ownership";
const CREATE_SCHOOL_DRAFT_KEY = "starliz_create_school_draft";

type CreateSchoolDraft = {
  name: string;
  type: string;
  status: string;
  licenceTier: string;
  email: string;
  phone: string;
  priority: string;
  region: string;
  regionComplianceProfile: string;
  communicationPreferences: string;
  parentOnboardingMode: string;
  retentionStrategy: string;
  escalationChain: string;
  safeguardingWorkflow: string;
  approvalWorkflow: string;
  launchTarget: string;
  onboardingBrief: string;
  safeguardingLead: string;
  dslContact: string;
  dataRetention: string;
  wizardStep: 1 | 2 | 3;
  confirmChecked: boolean;
  savedAt: string;
};

type ProvisioningStep = {
  id: string;
  label: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "error";
  estimatedSeconds: number;
};

const PROVISIONING_STEPS: ProvisioningStep[] = [
  {
    id: "workspace",
    label: "Creating workspace",
    description: "Setting up isolated workspace with governance tracking",
    status: "pending",
    estimatedSeconds: 4,
  },
  {
    id: "governance",
    label: "Applying governance profile",
    description: "Applying policy templates, controls, and compliance defaults",
    status: "pending",
    estimatedSeconds: 3,
  },
  {
    id: "safeguarding",
    label: "Preparing safeguarding systems",
    description: "Activating safeguarding workflows and incident response controls",
    status: "pending",
    estimatedSeconds: 3,
  },
  {
    id: "admin",
    label: "Configuring admin access",
    description: "Creating admin roles and assigning operational permissions",
    status: "pending",
    estimatedSeconds: 2,
  },
  {
    id: "monitoring",
    label: "Finalising onboarding",
    description: "Completing launch controls, readiness checks, and activity hooks",
    status: "pending",
    estimatedSeconds: 3,
  },
];

function getSavedViewPreset(name: SavedViewName | null): SavedOperationalView | null {
  if (!name) return null;
  return SAVED_OPERATIONAL_VIEWS.find((view) => view.name === name) ?? null;
}

function saveDraftToStorage(draft: CreateSchoolDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CREATE_SCHOOL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // no-op for local storage access failures
  }
}

function readDraftFromStorage(): CreateSchoolDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(CREATE_SCHOOL_DRAFT_KEY);
    return stored ? (JSON.parse(stored) as CreateSchoolDraft) : null;
  } catch {
    return null;
  }
}

function clearDraftFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CREATE_SCHOOL_DRAFT_KEY);
  } catch {
    // no-op for local storage access failures
  }
}

function readSavedViewFromStorage(): SavedViewName | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(OPS_SAVED_VIEW_KEY) as SavedViewName | null;
    return getSavedViewPreset(stored)?.name ?? null;
  } catch {
    return null;
  }
}

function readOwnershipFromStorage(): Record<string, OwnershipRecord> {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(OPS_OWNERSHIP_KEY);
    return stored ? (JSON.parse(stored) as Record<string, OwnershipRecord>) : {};
  } catch {
    return {};
  }
}

function createdWithinDays(iso: string, days: number): boolean {
  const createdAt = new Date(iso).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt <= days * 24 * 60 * 60 * 1000;
}

function createdInPreviousWindow(iso: string, days: number): boolean {
  const createdAt = new Date(iso).getTime();
  if (Number.isNaN(createdAt)) return false;
  const age = Date.now() - createdAt;
  const windowMs = days * 24 * 60 * 60 * 1000;
  return age > windowMs && age <= windowMs * 2;
}

function isOlderThan(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const createdAt = new Date(iso).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt > days * 24 * 60 * 60 * 1000;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const now = Date.now();
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function schoolRiskState(school: SchoolRecord) {
  const activeTeachers = school.teachers.filter((row) => row.status === "active").length;
  const hasInactiveClassrooms = school.classrooms.some((row) => row.status !== "active");
  const seatFull = Boolean(school.licence?.seatLimit && school.licence.seatsUsed >= school.licence.seatLimit);
  const licenceExpired = Boolean(
    (school.licence?.currentPeriodEnd && daysUntil(school.licence.currentPeriodEnd)! < 0)
      || (school.licence?.trialEndsAt && daysUntil(school.licence.trialEndsAt)! < 0),
  );
  const licenceExpiringSoon = Boolean(
    (school.licence?.currentPeriodEnd && (daysUntil(school.licence.currentPeriodEnd) ?? 999) <= 30)
      || (school.licence?.trialEndsAt && (daysUntil(school.licence.trialEndsAt) ?? 999) <= 30),
  );

  return {
    activeTeachers,
    hasInactiveClassrooms,
    seatFull,
    licenceExpired,
    licenceExpiringSoon,
    hasLicenceRisk: !school.licence || ["past_due", "suspended", "cancelled", "archived"].includes(school.licence.status) || licenceExpired,
    hasSafeguardingRisk: school.safeguarding.criticalAlerts > 0 || school.safeguarding.openAlerts > 0,
  };
}

type LaunchReadinessScore = {
  profileCompleteness: number;
  contactVerification: number;
  launchPlanning: number;
  governanceSetup: number;
  overallScore: number;
  status: "Not Ready" | "At Risk" | "Ready for Launch";
  recommendations: string[];
};

function calculateLaunchReadinessScore(
  name: string,
  email: string,
  phone: string,
  launchTarget: string,
  region: string,
  priority: string,
  onboardingBrief: string,
  safeguardingLead?: string,
  dslContact?: string,
  dataRetention?: string,
  regionComplianceProfile?: string,
  communicationPreferences?: string,
  parentOnboardingMode?: string,
  retentionStrategy?: string,
  escalationChain?: string,
  safeguardingWorkflow?: string,
  approvalWorkflow?: string,
): LaunchReadinessScore {
  const complianceScore = !regionComplianceProfile?.trim()
    ? 0
    : regionComplianceProfile === "regional_baseline"
      ? 5
      : 10;
  const communicationScore = !communicationPreferences?.trim()
    ? 0
    : communicationPreferences === "email_only"
      ? 5
      : 10;
  const parentOnboardingScore = !parentOnboardingMode?.trim()
    ? 0
    : parentOnboardingMode === "self_serve"
      ? 5
      : 10;
  const retentionScore = !retentionStrategy?.trim()
    ? 0
    : retentionStrategy === "standard_3yr"
      ? 5
      : 10;
  const escalationScore = !escalationChain?.trim()
    ? 0
    : escalationChain === "dsl_then_head"
      ? 5
      : 10;
  const safeguardingWorkflowScore = !safeguardingWorkflow?.trim()
    ? 0
    : safeguardingWorkflow === "standard"
      ? 5
      : 10;
  const approvalScore = !approvalWorkflow?.trim()
    ? 0
    : approvalWorkflow === "headteacher_only"
      ? 5
      : 10;

  const scores = {
    profileCompleteness: (name.trim().length > 0 ? 50 : 0) + (name.trim().length > 5 ? 50 : 0),
    contactVerification: (email.trim().length > 0 && email.includes("@") ? 50 : 0) + (phone.trim().length > 0 ? 50 : 0),
    launchPlanning: (launchTarget.trim().length > 0 ? 50 : 0) + (priority !== "standard" ? 50 : 25),
    governanceSetup:
      (region.trim().length > 0 ? 12 : 0) +
      (onboardingBrief.trim().length > 20 ? 12 : 0) +
      (safeguardingLead?.trim().length ? 12 : 0) +
      (dslContact?.trim().length ? 12 : 0) +
      (dataRetention?.trim().length && dataRetention !== "" ? 8 : 0) +
      complianceScore +
      communicationScore +
      parentOnboardingScore +
      retentionScore +
      escalationScore +
      safeguardingWorkflowScore +
      approvalScore,
  };

  const overallScore = Math.round((scores.profileCompleteness + scores.contactVerification + scores.launchPlanning + scores.governanceSetup) / 4);

  const recommendations: string[] = [];
  if (!name.trim()) recommendations.push("School name is required");
  if (name.trim().length < 5) recommendations.push("Use a complete school name");
  if (!email.trim() || !email.includes("@")) recommendations.push("Add a valid contact email");
  if (!phone.trim()) recommendations.push("Add a contact phone number");
  if (!launchTarget.trim()) recommendations.push("Set a target launch date");
  if (priority === "critical" && !onboardingBrief.trim()) recommendations.push("Critical priority requires operational brief");
  if (onboardingBrief.trim().length < 20) recommendations.push("Add a more detailed operational brief");
  if (!regionComplianceProfile?.trim()) recommendations.push("Select a region compliance profile");
  else if (regionComplianceProfile === "regional_baseline") recommendations.push("Consider a stronger regional compliance profile");
  if (!communicationPreferences?.trim()) recommendations.push("Choose parent communication preferences");
  else if (communicationPreferences === "email_only") recommendations.push("Consider a stronger multi-channel communication preference");
  if (!parentOnboardingMode?.trim()) recommendations.push("Select a parent onboarding mode");
  else if (parentOnboardingMode === "self_serve") recommendations.push("Review whether self-serve parent onboarding is sufficient for launch");
  if (!retentionStrategy?.trim()) recommendations.push("Define a data retention strategy");
  if (!escalationChain?.trim()) recommendations.push("Configure escalation routing for incidents");
  if (!safeguardingWorkflow?.trim()) recommendations.push("Select a safeguarding workflow profile");
  if (!approvalWorkflow?.trim()) recommendations.push("Define approval workflows for incident resolution");

  let status: "Not Ready" | "At Risk" | "Ready for Launch" = "Not Ready";
  if (overallScore >= 75) status = "Ready for Launch";
  else if (overallScore >= 50) status = "At Risk";

  return {
    profileCompleteness: scores.profileCompleteness,
    contactVerification: scores.contactVerification,
    launchPlanning: scores.launchPlanning,
    governanceSetup: scores.governanceSetup,
    overallScore,
    status,
    recommendations,
  };
}

function generateSmartRecommendations(
  readinessScore: LaunchReadinessScore,
  name: string,
  email: string,
  phone: string,
  launchTarget: string,
  region: string,
  priority: string,
  onboardingBrief: string,
  safeguardingLead: string,
  dslContact: string,
  dataRetention: string,
  regionComplianceProfile: string,
  communicationPreferences: string,
  parentOnboardingMode: string,
  retentionStrategy: string,
  escalationChain: string,
  safeguardingWorkflow: string,
  approvalWorkflow: string,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Profile recommendations
  if (!name.trim()) {
    recs.push({
      id: "profile-name",
      title: "School name required",
      description: "Enter the official school or organisation name",
      category: "profile",
      priority: "critical",
      fieldToFix: "createName",
    });
  } else if (name.trim().length < 5) {
    recs.push({
      id: "profile-name-length",
      title: "Use complete school name",
      description: "Abbreviated names may cause confusion. Use the full official name.",
      category: "profile",
      priority: "medium",
      fieldToFix: "createName",
    });
  }

  // Contact recommendations
  if (!email.trim() || !email.includes("@")) {
    recs.push({
      id: "contact-email",
      title: "Valid email required",
      description: "Use a monitored email for onboarding communications",
      category: "contact",
      priority: "critical",
      fieldToFix: "createEmail",
    });
  }

  if (!phone.trim()) {
    recs.push({
      id: "contact-phone",
      title: "Add contact phone number",
      description: "Essential for urgent operational contact",
      category: "contact",
      priority: "high",
      fieldToFix: "createPhone",
    });
  }

  // Governance recommendations
  if (!safeguardingLead.trim()) {
    recs.push({
      id: "governance-safeguarding",
      title: "Assign safeguarding lead",
      description: "Critical for compliance and incident response",
      category: "governance",
      priority: "critical",
      fieldToFix: "createSafeguardingLead",
    });
  }

  if (!dslContact.trim()) {
    recs.push({
      id: "governance-dsl",
      title: "Designate DSL contact",
      description: "Data Subject Lead required for GDPR compliance",
      category: "governance",
      priority: "high",
      fieldToFix: "createDslContact",
    });
  }

  if (!dataRetention.trim()) {
    recs.push({
      id: "governance-retention",
      title: "Set data retention policy",
      description: "Define student and staff data retention schedules",
      category: "governance",
      priority: "medium",
      fieldToFix: "createDataRetention",
    });
  }

  if (!regionComplianceProfile.trim()) {
    recs.push({
      id: "governance-region-compliance",
      title: "Select region compliance profile",
      description: "Map onboarding to the right regional compliance operating profile before launch.",
      category: "governance",
      priority: "high",
      fieldToFix: "createRegionComplianceProfile",
    });
  } else if (regionComplianceProfile === "regional_baseline") {
    recs.push({
      id: "governance-region-compliance-strength",
      title: "Review baseline compliance coverage",
      description: "Baseline regional coverage may be too light for schools with higher safeguarding or parent communication complexity.",
      category: "governance",
      priority: "medium",
      fieldToFix: "createRegionComplianceProfile",
    });
  }

  if (!communicationPreferences.trim()) {
    recs.push({
      id: "governance-communication-preferences",
      title: "Choose communication preferences",
      description: "Define how parent communications and escalation messages should be delivered.",
      category: "governance",
      priority: "high",
      fieldToFix: "createCommunicationPreferences",
    });
  } else if (communicationPreferences === "email_only") {
    recs.push({
      id: "governance-communication-resilience",
      title: "Strengthen communication resilience",
      description: "Email-only communication can slow parent response during operational or safeguarding escalation.",
      category: "governance",
      priority: "medium",
      fieldToFix: "createCommunicationPreferences",
    });
  }

  if (!parentOnboardingMode.trim()) {
    recs.push({
      id: "governance-parent-onboarding",
      title: "Select parent onboarding mode",
      description: "Clarify how parents will be activated into the platform and support journey.",
      category: "governance",
      priority: "medium",
      fieldToFix: "createParentOnboardingMode",
    });
  } else if (parentOnboardingMode === "self_serve") {
    recs.push({
      id: "governance-parent-onboarding-support",
      title: "Confirm self-serve parent onboarding fit",
      description: "Self-serve onboarding is lightweight but may need additional support for complex launches.",
      category: "governance",
      priority: "low",
      fieldToFix: "createParentOnboardingMode",
    });
  }

  if (!retentionStrategy.trim()) {
    recs.push({
      id: "governance-retention-strategy",
      title: "Define data retention strategy",
      description: "Establish how long different data types will be retained before archival or deletion.",
      category: "governance",
      priority: "high",
      fieldToFix: "createRetentionStrategy",
    });
  } else if (retentionStrategy === "standard_3yr") {
    recs.push({
      id: "governance-retention-strategy-check",
      title: "Verify standard retention meets compliance needs",
      description: "3-year retention is standard but may be insufficient for schools with extended audit requirements.",
      category: "governance",
      priority: "medium",
      fieldToFix: "createRetentionStrategy",
    });
  }

  if (!escalationChain.trim()) {
    recs.push({
      id: "governance-escalation-chain",
      title: "Configure escalation routing",
      description: "Define who incidents and safeguarding concerns escalate to and in what sequence.",
      category: "governance",
      priority: "critical",
      fieldToFix: "createEscalationChain",
    });
  } else if (escalationChain === "dsl_then_head") {
    recs.push({
      id: "governance-escalation-strength",
      title: "Review escalation coverage",
      description: "DSL-then-Head routing may lack multi-agency coordination for complex safeguarding cases.",
      category: "governance",
      priority: "medium",
      fieldToFix: "createEscalationChain",
    });
  }

  if (!safeguardingWorkflow.trim()) {
    recs.push({
      id: "governance-safeguarding-workflow",
      title: "Select safeguarding workflow profile",
      description: "Choose the operational profile that matches your school&apos;s safeguarding capacity and complexity.",
      category: "governance",
      priority: "critical",
      fieldToFix: "createSafeguardingWorkflow",
    });
  } else if (safeguardingWorkflow === "standard") {
    recs.push({
      id: "governance-safeguarding-workflow-check",
      title: "Confirm standard safeguarding workflow is sufficient",
      description: "Standard workflow supports routine incidents but may need enhancement for high-risk environments.",
      category: "governance",
      priority: "low",
      fieldToFix: "createSafeguardingWorkflow",
    });
  }

  if (!approvalWorkflow.trim()) {
    recs.push({
      id: "governance-approval-workflow",
      title: "Define approval workflows",
      description: "Establish who must approve incident resolution, policy changes, and regulatory updates.",
      category: "governance",
      priority: "high",
      fieldToFix: "createApprovalWorkflow",
    });
  } else if (approvalWorkflow === "headteacher_only") {
    recs.push({
      id: "governance-approval-workflow-check",
      title: "Review headteacher-only approval coverage",
      description: "Single-approver workflows can create bottlenecks; consider shared responsibility with DSL or governors.",
      category: "governance",
      priority: "medium",
      fieldToFix: "createApprovalWorkflow",
    });
  }

  // Launch recommendations
  if (!launchTarget.trim()) {
    recs.push({
      id: "launch-date",
      title: "Set target launch date",
      description: "Essential for resource planning and coordination",
      category: "launch",
      priority: "high",
      fieldToFix: "createLaunchTarget",
    });
  }

  if (!region.trim()) {
    recs.push({
      id: "launch-region",
      title: "Select delivery region",
      description: "Ensures compliance with regional data regulations",
      category: "launch",
      priority: "high",
      fieldToFix: "createRegion",
    });
  }

  if (priority === "critical" && !onboardingBrief.trim()) {
    recs.push({
      id: "launch-brief-critical",
      title: "Critical priority requires operational brief",
      description: "Executive oversight needs context on staffing, risks, or constraints",
      category: "launch",
      priority: "critical",
      fieldToFix: "createOnboardingBrief",
    });
  }

  if (onboardingBrief.trim().length < 20 && onboardingBrief.trim().length > 0) {
    recs.push({
      id: "launch-brief-detail",
      title: "Expand operational brief",
      description: "Add more detail on staffing needs, safeguarding concerns, or constraints",
      category: "launch",
      priority: "medium",
      fieldToFix: "createOnboardingBrief",
    });
  }

  if (priority !== "critical" && !launchTarget.trim()) {
    recs.push({
      id: "launch-priority-context",
      title: "Consider accelerated priority",
      description: "If staff or governance setup is complex, accelerated priority enables faster response",
      category: "launch",
      priority: "low",
      fieldToFix: "createPriority",
    });
  }

  // Remove duplicates, sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return Array.from(new Map(recs.map(r => [r.id, r])).values()).sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}

export default function AdminSchoolsPage() {
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [activeSavedView, setActiveSavedView] = useState<SavedViewName | null>(() => readSavedViewFromStorage());
  const [quickFilters, setQuickFilters] = useState<QuickFilterState>(() => {
    const preset = getSavedViewPreset(readSavedViewFromStorage());
    return preset ? { ...preset.filters } : { ...DEFAULT_QUICK_FILTERS };
  });
  const [focusedOpsSection, setFocusedOpsSection] = useState<"dashboard" | "teachers" | "safeguarding" | "communication" | "exports">(() => {
    const preset = getSavedViewPreset(readSavedViewFromStorage());
    return preset?.focus ?? "dashboard";
  });
  const [ownershipBySchool, setOwnershipBySchool] = useState<Record<string, OwnershipRecord>>(() => readOwnershipFromStorage());
  const [liveSnapshot, setLiveSnapshot] = useState<OpsLiveSnapshot | null>(null);
  const [liveTransport, setLiveTransport] = useState<OpsLiveTransport | "offline">("offline");
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);

  // Initialize create form from draft or defaults
  const initialDraft = useMemo(() => readDraftFromStorage(), []);
  const [draftRestoredIndicator, setDraftRestoredIndicator] = useState(!!initialDraft);
  
  const [createName, setCreateName] = useState(initialDraft?.name ?? "");
  const [createType, setCreateType] = useState(initialDraft?.type ?? "school");
  const [createStatus, setCreateStatus] = useState(initialDraft?.status ?? "pilot");
  const [createLicenceTier, setCreateLicenceTier] = useState(initialDraft?.licenceTier ?? "starter");
  const [createEmail, setCreateEmail] = useState(initialDraft?.email ?? "");
  const [createPhone, setCreatePhone] = useState(initialDraft?.phone ?? "");
  const [createPriority, setCreatePriority] = useState(initialDraft?.priority ?? "standard");
  const [createRegion, setCreateRegion] = useState(initialDraft?.region ?? "UK South");
  const [createRegionComplianceProfile, setCreateRegionComplianceProfile] = useState(initialDraft?.regionComplianceProfile ?? "");
  const [createCommunicationPreferences, setCreateCommunicationPreferences] = useState(initialDraft?.communicationPreferences ?? "");
  const [createParentOnboardingMode, setCreateParentOnboardingMode] = useState(initialDraft?.parentOnboardingMode ?? "");
  const [createRetentionStrategy, setCreateRetentionStrategy] = useState(initialDraft?.retentionStrategy ?? "");
  const [createEscalationChain, setCreateEscalationChain] = useState(initialDraft?.escalationChain ?? "");
  const [createSafeguardingWorkflow, setCreateSafeguardingWorkflow] = useState(initialDraft?.safeguardingWorkflow ?? "");
  const [createApprovalWorkflow, setCreateApprovalWorkflow] = useState(initialDraft?.approvalWorkflow ?? "");
  const [createLaunchTarget, setCreateLaunchTarget] = useState(initialDraft?.launchTarget ?? "");
  const [createOnboardingBrief, setCreateOnboardingBrief] = useState(initialDraft?.onboardingBrief ?? "");
  const [createWizardStep, setCreateWizardStep] = useState<1 | 2 | 3>(initialDraft?.wizardStep ?? 1);
  const [createConfirmChecked, setCreateConfirmChecked] = useState(initialDraft?.confirmChecked ?? false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastUnresolvedRef = useRef<number | null>(null);

  // Provisioning workflow state
  const [provisioningSteps, setProvisioningSteps] = useState<ProvisioningStep[]>(PROVISIONING_STEPS.map(step => ({ ...step })));
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisioningComplete, setProvisioningComplete] = useState(false);
  const [provisioningJobId, setProvisioningJobId] = useState<string | null>(null);
  const backendProvisioningEnabled = process.env.NEXT_PUBLIC_ENABLE_BACKEND_PROVISIONING === "1";
  const [createdSchoolInfo, setCreatedSchoolInfo] = useState<{
    id: string;
    name: string;
    code: string;
    licenceTier: string;
    onboardingPriority: string;
    region: string;
    launchTarget: string;
    safeguardingLead: string;
    dslContact: string;
    dataRetention: string;
    regionComplianceProfile: string;
    communicationPreferences: string;
    parentOnboardingMode: string;
    retentionStrategy: string;
    escalationChain: string;
    safeguardingWorkflow: string;
    approvalWorkflow: string;
  } | null>(null);

  // Governance and audit trail state
  const [createSafeguardingLead, setCreateSafeguardingLead] = useState(initialDraft?.safeguardingLead ?? "");
  const [createDslContact, setCreateDslContact] = useState(initialDraft?.dslContact ?? "");
  const [createDataRetention, setCreateDataRetention] = useState(initialDraft?.dataRetention ?? "standard");
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditExporting, setAuditExporting] = useState(false);
  const [auditSeverityFilter, setAuditSeverityFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [provisioningHistory, setProvisioningHistory] = useState<ProvisioningJobRecord[]>([]);
  const [provisioningHistoryLoading, setProvisioningHistoryLoading] = useState(false);
  const [provisioningRunnerBusy, setProvisioningRunnerBusy] = useState(false);
  const [provisioningExpanded, setProvisioningExpanded] = useState(false);
  const [trusts, setTrusts] = useState<TrustRecord[]>([]);
  const [trustsLoading, setTrustsLoading] = useState(false);
  const [trustName, setTrustName] = useState("");
  const [trustCode, setTrustCode] = useState("");
  const [trustRegion, setTrustRegion] = useState("UK South");
  const [selectedTrustId, setSelectedTrustId] = useState("");
  const [trustSearch, setTrustSearch] = useState("");
  const [bulkRowsInput, setBulkRowsInput] = useState("Ops Cohort Alpha Academy\nOps Cohort Beta Academy");
  const [bulkDryRun, setBulkDryRun] = useState(true);
  const [bulkBatches, setBulkBatches] = useState<BulkBatchRecord[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showMatPanel, setShowMatPanel] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferenceRecord[]>([]);
  const [notificationEvents, setNotificationEvents] = useState<NotificationEventRecord[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [prefEventType, setPrefEventType] = useState("safeguarding.alert");
  const [prefEmailEnabled, setPrefEmailEnabled] = useState(true);
  const [prefSmsEnabled, setPrefSmsEnabled] = useState(false);
  const [prefWhatsAppEnabled, setPrefWhatsAppEnabled] = useState(false);
  const [prefMinSeverity, setPrefMinSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [manualEventType, setManualEventType] = useState("manual.test");
  const [manualEventSeverity, setManualEventSeverity] = useState<"info" | "warning" | "critical">("info");
  const [manualEventPayload, setManualEventPayload] = useState('{"message":"manual dispatch test"}');
  const [showSmartRecommendations, setShowSmartRecommendations] = useState(false);
  const [showLaunchReadinessDetails, setShowLaunchReadinessDetails] = useState(false);
  
  // School Operations subsection collapse states
  const [showClassrooms, setShowClassrooms] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [showEnrolments, setShowEnrolments] = useState(false);
  
  // Governance Area subsection collapse states
  const [showCompliance, setShowCompliance] = useState(false);
  const [showCommunicationAudit, setShowCommunicationAudit] = useState(false);
  const [showSafeguardingDetails, setShowSafeguardingDetails] = useState(false);
  const [showParentPreferences, setShowParentPreferences] = useState(false);
  const [showOperationalOwnership, setShowOperationalOwnership] = useState(false);
  const [showSLAAgeing, setShowSLAAgeing] = useState(false);
  const [showInterventionQueue, setShowInterventionQueue] = useState(false);
  const [showActivityTimeline, setShowActivityTimeline] = useState(false);
  const [createFocusField, setCreateFocusField] = useState<CreateWizardField | null>(null);
  const createFieldRefs = useRef<Record<CreateWizardField, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>({
    createName: null,
    createEmail: null,
    createPhone: null,
    createPriority: null,
    createRegion: null,
    createRegionComplianceProfile: null,
    createCommunicationPreferences: null,
    createParentOnboardingMode: null,
    createRetentionStrategy: null,
    createEscalationChain: null,
    createSafeguardingWorkflow: null,
    createApprovalWorkflow: null,
    createLaunchTarget: null,
    createOnboardingBrief: null,
    createSafeguardingLead: null,
    createDslContact: null,
    createDataRetention: null,
  });

  const [editSchoolName, setEditSchoolName] = useState("");
  const [editSchoolType, setEditSchoolType] = useState("school");
  const [editSchoolStatus, setEditSchoolStatus] = useState("pilot");
  const [editSchoolEmail, setEditSchoolEmail] = useState("");
  const [editSchoolPhone, setEditSchoolPhone] = useState("");
  const [editSchoolNotes, setEditSchoolNotes] = useState("");

  const [licenceStatus, setLicenceStatus] = useState("pilot");
  const [licenceSeatLimit, setLicenceSeatLimit] = useState("0");
  const [licenceProvider, setLicenceProvider] = useState("manual");
  const [licenceInterval, setLicenceInterval] = useState("custom");
  const [licenceTrialEndsAt, setLicenceTrialEndsAt] = useState("");
  const [licenceCurrentPeriodEnd, setLicenceCurrentPeriodEnd] = useState("");

  const [classroomName, setClassroomName] = useState("");
  const [classroomYearGroup, setClassroomYearGroup] = useState("");
  const [classroomAcademicYear, setClassroomAcademicYear] = useState("");
  const [classroomTeacherId, setClassroomTeacherId] = useState("");

  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherRole, setTeacherRole] = useState("teacher");
  const [teacherTitle, setTeacherTitle] = useState("");

  const [assignChildId, setAssignChildId] = useState("");
  const [assignClassroomId, setAssignClassroomId] = useState("");
  const [assignExternalRef, setAssignExternalRef] = useState("");

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  const filteredSchools = useMemo(() => {
    return schools.filter((school) => {
      const risk = schoolRiskState(school);
      if (quickFilters.licenceRisk && !risk.hasLicenceRisk) return false;
      if (quickFilters.safeguardingRisk && !risk.hasSafeguardingRisk) return false;
      if (quickFilters.suspendedSchools && school.status !== "suspended") return false;
      if (quickFilters.seatCapacity && !risk.seatFull) return false;
      if (quickFilters.noActiveTeachers && risk.activeTeachers > 0) return false;
      if (quickFilters.expiringLicences && !risk.licenceExpiringSoon) return false;
      return true;
    });
  }, [schools, quickFilters]);

  const portfolioMetrics = useMemo(() => {
    const schoolsCount = schools.length;
    const activeStudents = schools.reduce(
      (sum, school) => sum + school.students.filter((row) => row.status === "active").length,
      0,
    );
    const activeTeachers = schools.reduce(
      (sum, school) => sum + school.teachers.filter((row) => row.status === "active").length,
      0,
    );
    const totalSeatsUsed = schools.reduce((sum, school) => sum + (school.licence?.seatsUsed ?? 0), 0);
    const totalSeatLimit = schools.reduce((sum, school) => sum + (school.licence?.seatLimit ?? 0), 0);
    const safeguardingAlerts = schools.reduce((sum, school) => sum + school.safeguarding.openAlerts, 0);

    return {
      schoolsCount,
      activeStudents,
      activeTeachers,
      totalSeatsUsed,
      totalSeatLimit,
      safeguardingAlerts,
    };
  }, [schools]);

  // Severity filter state
  const [severityFilter, setSeverityFilter] = useState<EscalationSeverity | "All">("All");

  const launchReadinessScore = useMemo(() => {
    return calculateLaunchReadinessScore(
      createName,
      createEmail,
      createPhone,
      createLaunchTarget,
      createRegion,
      createPriority,
      createOnboardingBrief,
      createSafeguardingLead,
      createDslContact,
      createDataRetention,
      createRegionComplianceProfile,
      createCommunicationPreferences,
      createParentOnboardingMode,
      createRetentionStrategy,
      createEscalationChain,
      createSafeguardingWorkflow,
      createApprovalWorkflow,
    );
  }, [createName, createEmail, createPhone, createLaunchTarget, createRegion, createPriority, createOnboardingBrief, createSafeguardingLead, createDslContact, createDataRetention, createRegionComplianceProfile, createCommunicationPreferences, createParentOnboardingMode, createRetentionStrategy, createEscalationChain, createSafeguardingWorkflow, createApprovalWorkflow]);

  const smartRecommendations = useMemo(() => {
    return generateSmartRecommendations(
      launchReadinessScore,
      createName,
      createEmail,
      createPhone,
      createLaunchTarget,
      createRegion,
      createPriority,
      createOnboardingBrief,
      createSafeguardingLead,
      createDslContact,
      createDataRetention,
      createRegionComplianceProfile,
      createCommunicationPreferences,
      createParentOnboardingMode,
      createRetentionStrategy,
      createEscalationChain,
      createSafeguardingWorkflow,
      createApprovalWorkflow,
    );
  }, [launchReadinessScore, createName, createEmail, createPhone, createLaunchTarget, createRegion, createPriority, createOnboardingBrief, createSafeguardingLead, createDslContact, createDataRetention, createRegionComplianceProfile, createCommunicationPreferences, createParentOnboardingMode, createRetentionStrategy, createEscalationChain, createSafeguardingWorkflow, createApprovalWorkflow]);

  const escalationQueue = useMemo(() => {
    return schools
      .map((school) => {
        const risk = schoolRiskState(school);
        const activeClassrooms = school.classrooms.filter((row) => row.status === "active").length;
        const missingSafeguardingLead = !ownershipBySchool[school.id]?.safeguardingLead?.trim();
        const hasRecentStudentActivity = school.activityTimeline.some(
          (event) => event.entityType.toLowerCase().includes("student") && !isOlderThan(event.createdAt, 7),
        );
        const latestAttendanceEvent = school.activityTimeline
          .filter((event) => event.action.toLowerCase().includes("attendance"))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
        const attendanceFeedOffline = latestAttendanceEvent ? isOlderThan(latestAttendanceEvent.createdAt, 2) : false;
        const communicationFailures = school.communicationLogs.filter((log) => log.deliveryStatus !== "sent").length;
        const hasCommunicationFailure = communicationFailures > 0;
        const licenceExpiringSoon = Boolean(school.licence?.currentPeriodEnd && (daysUntil(school.licence.currentPeriodEnd) ?? 999) <= 14);

        const signals: EscalationSignal[] = [];
        if (risk.activeTeachers === 0) signals.push({ label: "No Active Teachers", severity: "Critical" });
        if (activeClassrooms === 0) signals.push({ label: "No Active Classrooms", severity: "High" });
        if (missingSafeguardingLead) signals.push({ label: "No Safeguarding Lead Assigned", severity: "Critical" });
        if (risk.licenceExpired) signals.push({ label: "Licence Expired", severity: "High" });
        if (licenceExpiringSoon && !risk.licenceExpired) signals.push({ label: "Licence Expiring", severity: "Medium" });
        if (!hasRecentStudentActivity) signals.push({ label: "No Student Activity", severity: "High" });
        if (attendanceFeedOffline) signals.push({ label: "Attendance Feed Offline", severity: "Medium" });
        if (hasCommunicationFailure) signals.push({ label: "Communication Failure", severity: "Medium" });
        if (school.safeguarding.criticalAlerts > 0) signals.push({ label: "Critical Safeguarding", severity: "Critical" });
        if (school.safeguarding.openAlerts > 0 && school.safeguarding.criticalAlerts === 0) signals.push({ label: "Open Safeguarding Alerts", severity: "High" });
        if (risk.seatFull) signals.push({ label: "Over Capacity", severity: "High" });

        const severityScore = signals.reduce((sum, signal) => sum + SEVERITY_WEIGHT[signal.severity], 0);
        const severity: EscalationSeverity = signals.some((signal) => signal.severity === "Critical")
          ? "Critical"
          : signals.some((signal) => signal.severity === "High")
            ? "High"
            : signals.some((signal) => signal.severity === "Medium")
              ? "Medium"
              : "Low";

        // Find the most recent escalation event for timestamp
        const escalationEvents = [
          ...school.activityTimeline.filter((e) => ["escalation", "alert", "risk"].some((k) => e.action.toLowerCase().includes(k))),
          ...school.safeguardingIncidents,
        ];
        const mostRecentEscalation = escalationEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const escalatedAt = mostRecentEscalation?.createdAt || school.updatedAt;

        // Governance owner (fallback to safeguardingLead, then reviewer, then default)
        const owner = ownershipBySchool[school.id]?.safeguardingLead || ownershipBySchool[school.id]?.reviewer || "Regional Governance Team";

        // SLA: 24h from escalation (example)
        const SLA_HOURS = 24;
        const slaDeadline = escalatedAt ? new Date(new Date(escalatedAt).getTime() + SLA_HOURS * 60 * 60 * 1000) : null;
        const slaMsRemaining = slaDeadline ? slaDeadline.getTime() - Date.now() : null;
        const slaHrsRemaining = slaMsRemaining !== null ? Math.max(0, Math.floor(slaMsRemaining / (1000 * 60 * 60))) : null;

        // Status tracking (simple example: based on signals)
        let status: string = "Awaiting staffing assignment";
        if (risk.activeTeachers > 0 && !missingSafeguardingLead) status = "In progress";
        if (signals.length === 0) status = "Resolved";

        const reasons = signals.slice(0, 3).map((signal) => signal.label);
        const aiInsight = severity === "Critical"
          ? "AI assessment predicts onboarding failure risk if staffing and safeguarding ownership are not resolved within 72 hours."
          : severity === "High"
            ? "School engagement setup is incomplete. Early intervention is recommended to avoid parent trust and attendance degradation."
            : "Operational instability detected. Monitor closely and complete pending governance actions this week.";

        return {
          school,
          severity,
          severityScore,
          signals,
          reasons,
          aiInsight,
          escalatedAt,
          owner,
          slaHrsRemaining,
          status,
        };
      })
      .filter((item) => item.signals.length > 0)
      .filter((item) => severityFilter === "All" || item.severity === severityFilter)
      .sort((a, b) => b.severityScore - a.severityScore);
  }, [ownershipBySchool, schools, severityFilter]);

  const trendAnalytics = useMemo(() => {
    const safeguardingLast7 = schools.reduce((sum, school) => {
      return sum + school.safeguardingIncidents.filter((incident) => createdWithinDays(incident.createdAt, 7)).length;
    }, 0);

    const safeguardingPrev7 = schools.reduce((sum, school) => {
      return sum + school.safeguardingIncidents.filter((incident) => createdInPreviousWindow(incident.createdAt, 7)).length;
    }, 0);

    const unresolvedSafeguarding = schools.reduce((sum, school) => {
      return sum + school.safeguardingIncidents.filter((incident) => incident.status !== "resolved").length;
    }, 0);

    const communicationFailures = schools.reduce((sum, school) => {
      return sum + school.communicationLogs.filter((log) => log.deliveryStatus !== "sent").length;
    }, 0);

    const studentsWithoutClassroom = schools.reduce((sum, school) => {
      return sum + school.students.filter((student) => !student.classroomName && student.status === "active").length;
    }, 0);

    return {
      safeguardingLast7,
      safeguardingPrev7,
      unresolvedSafeguarding,
      communicationFailures,
      studentsWithoutClassroom,
    };
  }, [schools]);

  const seatUtilizationPct = useMemo(() => {
    if (portfolioMetrics.totalSeatLimit <= 0) return null;
    return Math.round((portfolioMetrics.totalSeatsUsed / portfolioMetrics.totalSeatLimit) * 100);
  }, [portfolioMetrics.totalSeatLimit, portfolioMetrics.totalSeatsUsed]);

  const safeguardingDelta = trendAnalytics.safeguardingLast7 - trendAnalytics.safeguardingPrev7;

  const liveSnapshotCards = useMemo(() => {
    return {
      escalationQueueCount: liveSnapshot?.escalationQueueCount ?? escalationQueue.length,
      unresolvedSafeguarding: liveSnapshot?.unresolvedSafeguarding ?? trendAnalytics.unresolvedSafeguarding,
      communicationFailures24h: liveSnapshot?.communicationFailures24h ?? trendAnalytics.communicationFailures,
      suspensionEvents24h: liveSnapshot?.suspensionEvents24h ?? schools.filter((school) => school.status === "suspended").length,
      teacherInactivitySchools: liveSnapshot?.teacherInactivitySchools ?? schools.filter((school) => schoolRiskState(school).activeTeachers === 0).length,
      authAnomalySignals: liveSnapshot?.authAnomalySignals ?? 0,
    };
  }, [escalationQueue.length, liveSnapshot, schools, trendAnalytics.communicationFailures, trendAnalytics.unresolvedSafeguarding]);

  const fieldClass = "mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none";
  const panelClass = "rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4";
  const primaryButtonClass = "rounded-lg border border-indigo-400/20 bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";
  const subtleButtonClass = "rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-50";
  const wizardFieldClass = (field: CreateWizardField) => `${fieldClass} ${createFocusField === field ? "border-amber-400 ring-2 ring-amber-400/50" : ""}`;
  const regionComplianceProfileLabel = {
    regional_baseline: "Regional Baseline",
    uk_dfe_enhanced: "UK DfE Enhanced",
    scotland_public_sector: "Scotland Public Sector",
    international_cross_border: "International Cross-Border",
  }[createRegionComplianceProfile] ?? "-";
  const communicationPreferenceLabel = {
    email_only: "Email Only",
    email_sms: "Email + SMS Escalations",
    parent_app: "Parent App Primary",
    omnichannel: "Omnichannel Governance",
  }[createCommunicationPreferences] ?? "-";
  const parentOnboardingModeLabel = {
    self_serve: "Self-Serve Invites",
    assisted_cohort: "Admin-Assisted Cohort",
    concierge: "Concierge Launch Support",
    hybrid_rollout: "Hybrid Phased Rollout",
  }[createParentOnboardingMode] ?? "-";
  const retentionStrategyLabel = {
    standard_3yr: "Standard (3-year)",
    extended_6yr: "Extended (6-year)",
    archive_quarterly: "Archive Quarterly",
    delete_annually: "Delete Annually",
  }[createRetentionStrategy] ?? "-";
  const escalationChainLabel = {
    dsl_then_head: "DSL then Headteacher",
    safeguarding_team: "Safeguarding Team",
    multi_agency: "Multi-Agency Escalation",
    ceo_oversight: "CEO/Trust Oversight",
  }[createEscalationChain] ?? "-";
  const safeguardingWorkflowLabel = {
    standard: "Standard Workflow",
    enhanced: "Enhanced Monitoring",
    critical: "Critical Incident Protocol",
    multi_agency: "Multi-Agency Protocol",
  }[createSafeguardingWorkflow] ?? "-";
  const approvalWorkflowLabel = {
    headteacher_only: "Headteacher Only",
    dsl_and_head: "DSL & Headteacher",
    safeguarding_team: "Safeguarding Team",
    external_review: "External Review",
  }[createApprovalWorkflow] ?? "-";
  const createFieldStepMap: Record<CreateWizardField, 1 | 2 | 3> = {
    createName: 1,
    createEmail: 1,
    createPhone: 1,
    createPriority: 2,
    createRegion: 2,
    createRegionComplianceProfile: 2,
    createCommunicationPreferences: 2,
    createParentOnboardingMode: 2,
    createRetentionStrategy: 2,
    createEscalationChain: 2,
    createSafeguardingWorkflow: 2,
    createApprovalWorkflow: 2,
    createLaunchTarget: 2,
    createOnboardingBrief: 2,
    createSafeguardingLead: 2,
    createDslContact: 2,
    createDataRetention: 2,
  };

  const handleFixNow = (field: CreateWizardField) => {
    setCreateWizardStep(createFieldStepMap[field]);
    setCreateFocusField(field);
  };

  useEffect(() => {
    if (!createFocusField) return;
    const target = createFieldRefs.current[createFocusField];
    if (!target) return;

    const frame = window.requestAnimationFrame(() => {
      target.focus();
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [createFocusField, createWizardStep]);

  useEffect(() => {
    const savedView = readSavedViewFromStorage();
    const preset = getSavedViewPreset(savedView);
    if (!savedView || !preset) return;
    const frame = window.requestAnimationFrame(() => {
      setActiveSavedView(savedView);
      setQuickFilters({ ...preset.filters });
      setFocusedOpsSection(preset.focus);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(OPS_OWNERSHIP_KEY, JSON.stringify(ownershipBySchool));
    } catch {
      // no-op for local storage access failures
    }
  }, [ownershipBySchool]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(OPS_SAVED_VIEW_KEY, activeSavedView || "");
    } catch {
      // no-op for local storage access failures
    }
  }, [activeSavedView]);

  // Auto-save draft whenever any wizard field changes
  useEffect(() => {
    const draft: CreateSchoolDraft = {
      name: createName,
      type: createType,
      status: createStatus,
      licenceTier: createLicenceTier,
      email: createEmail,
      phone: createPhone,
      priority: createPriority,
      region: createRegion,
      regionComplianceProfile: createRegionComplianceProfile,
      communicationPreferences: createCommunicationPreferences,
      parentOnboardingMode: createParentOnboardingMode,
      retentionStrategy: createRetentionStrategy,
      escalationChain: createEscalationChain,
      safeguardingWorkflow: createSafeguardingWorkflow,
      approvalWorkflow: createApprovalWorkflow,
      launchTarget: createLaunchTarget,
      onboardingBrief: createOnboardingBrief,
      safeguardingLead: createSafeguardingLead,
      dslContact: createDslContact,
      dataRetention: createDataRetention,
      wizardStep: createWizardStep,
      confirmChecked: createConfirmChecked,
      savedAt: new Date().toISOString(),
    };
    saveDraftToStorage(draft);
  }, [
    createName,
    createType,
    createStatus,
    createLicenceTier,
    createEmail,
    createPhone,
    createPriority,
    createRegion,
    createRegionComplianceProfile,
    createCommunicationPreferences,
    createParentOnboardingMode,
    createRetentionStrategy,
    createEscalationChain,
    createSafeguardingWorkflow,
    createApprovalWorkflow,
    createLaunchTarget,
    createOnboardingBrief,
    createSafeguardingLead,
    createDslContact,
    createDataRetention,
    createWizardStep,
    createConfirmChecked,
  ]);

  // Mock provisioning workflow animation (fallback path)
  useEffect(() => {
    if (backendProvisioningEnabled) return;
    if (!isProvisioning || provisioningComplete) return;

    let currentStepIndex = 0;
    const animateSteps = async () => {
      while (currentStepIndex < PROVISIONING_STEPS.length && isProvisioning) {
        // Mark current step as in-progress
        setProvisioningSteps((prev) =>
          prev.map((step, idx) => 
            idx === currentStepIndex 
              ? { ...step, status: "in-progress" as const }
              : step
          )
        );

        // Wait for estimated duration
        await new Promise((resolve) => setTimeout(resolve, PROVISIONING_STEPS[currentStepIndex]!.estimatedSeconds * 1000));

        // Mark current step as completed
        setProvisioningSteps((prev) =>
          prev.map((step, idx) => 
            idx === currentStepIndex 
              ? { ...step, status: "completed" as const }
              : step
          )
        );

        currentStepIndex += 1;
      }

      // All steps completed
      setIsProvisioning(false);
      setProvisioningComplete(true);
    };

    void animateSteps();
  }, [backendProvisioningEnabled, isProvisioning, provisioningComplete]);

  // Backend provisioning job polling (feature-flagged)
  useEffect(() => {
    if (!backendProvisioningEnabled) return;
    if (!provisioningJobId || !isProvisioning || provisioningComplete) return;

    let active = true;
    const tick = async () => {
      try {
        const response = await fetch(`/api/admin/schools/provisioning/jobs/${provisioningJobId}`, {
          credentials: "include",
        });
        if (!response.ok || !active) return;

        const data = (await response.json()) as {
          job?: {
            status: string;
            stepRuns: Array<{ stepKey: string; status: string }>;
          };
        };
        const stepRuns = data.job?.stepRuns ?? [];
        const stepStatus = new Map(stepRuns.map((step) => [step.stepKey, step.status]));

        setProvisioningSteps((prev) =>
          prev.map((step) => {
            const status = stepStatus.get(step.id) ?? "pending";
            if (status === "completed") return { ...step, status: "completed" as const };
            if (status === "running") return { ...step, status: "in-progress" as const };
            if (status === "failed") return { ...step, status: "error" as const };
            return { ...step, status: "pending" as const };
          }),
        );

        const jobStatus = data.job?.status ?? "";
        if (jobStatus === "succeeded") {
          setIsProvisioning(false);
          setProvisioningComplete(true);
        }
        if (jobStatus === "failed" || jobStatus === "cancelled" || jobStatus === "timed_out") {
          setIsProvisioning(false);
        }
      } catch {
        // no-op: keep previous UI state while polling continues
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [backendProvisioningEnabled, isProvisioning, provisioningComplete, provisioningJobId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const websocketBase = window.location.origin.startsWith("https://")
      ? window.location.origin.replace("https://", "wss://")
      : window.location.origin.replace("http://", "ws://");

    const stop = startOpsLiveBridge({
      websocketUrl: `${websocketBase}/api/admin/ops/live/ws`,
      sseUrl: "/api/admin/ops/live?transport=sse",
      pollingUrl: "/api/admin/ops/live",
      pollingIntervalMs: 15000,
      onUpdate: ({ transport, envelope }) => {
        setLiveTransport(transport);
        setLiveSnapshot(envelope.snapshot);
        setLiveUpdatedAt(envelope.generatedAt);
      },
      onStatus: ({ transport, state }) => {
        if (state === "connected") {
          setLiveTransport(transport);
        }
      },
    });

    return () => {
      stop();
    };
  }, []);

  useEffect(() => {
    if (!liveSnapshot) return;
    if (
      lastUnresolvedRef.current !== null
      && liveSnapshot.unresolvedSafeguarding > lastUnresolvedRef.current
    ) {
      enqueueToast(
        "Safeguarding alert created",
        `Open incidents increased to ${liveSnapshot.unresolvedSafeguarding}.`,
        "Open Safeguarding",
        () => jumpToSection("safeguarding"),
      );
    }
    lastUnresolvedRef.current = liveSnapshot.unresolvedSafeguarding;
  }, [liveSnapshot]);

  function applySchoolSelection(school: SchoolRecord | null) {
    if (!school) return;
    setSelectedSchoolId(school.id);
    void loadProvisioningHistory(school.id);
    void loadNotificationData(school.id);

    setEditSchoolName(school.name);
    setEditSchoolType(school.type || "school");
    setEditSchoolStatus(school.status || "pilot");
    setEditSchoolEmail(school.contactEmail ?? "");
    setEditSchoolPhone(school.contactPhone ?? "");
    setEditSchoolNotes(school.notes ?? "");

    setLicenceStatus(school.licence?.status ?? "pilot");
    setLicenceSeatLimit(String(school.licence?.seatLimit ?? 0));
    setLicenceProvider(school.licence?.provider ?? "manual");
    setLicenceInterval(school.licence?.billingInterval ?? "custom");
    setLicenceTrialEndsAt(isoToDateInput(school.licence?.trialEndsAt ?? null));
    setLicenceCurrentPeriodEnd(isoToDateInput(school.licence?.currentPeriodEnd ?? null));
  }

  function enqueueToast(title: string, detail: string, actionLabel?: string, onAction?: () => void) {
    const id = Date.now() + Math.floor(Math.random() * 10000);
    setToasts((prev) => [...prev, { id, title, detail, actionLabel, onAction }].slice(-4));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5000);
  }

  async function refreshLiveSnapshot() {
    try {
      const response = await fetch("/api/admin/ops/live", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const envelope = await response.json() as { generatedAt: string; snapshot: OpsLiveSnapshot };
      setLiveSnapshot(envelope.snapshot);
      setLiveUpdatedAt(envelope.generatedAt);
    } catch {
      // no-op: fallback values already rendered
    }
  }

  async function postAction(action: string, payload: Record<string, unknown>) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, payload }),
      });

      const data = (await response.json()) as { schools?: SchoolRecord[]; error?: string };
      if (!response.ok) {
        setError(data.error ?? "Unable to save school changes.");
        return { ok: false, schools: [] as SchoolRecord[] };
      }

      const nextSchools = data.schools ?? [];
      setSchools(nextSchools);
      const keepSelected = nextSchools.find((row) => row.id === selectedSchoolId) ?? nextSchools[0] ?? null;
      applySchoolSelection(keepSelected);
      setMessage("Changes saved.");
      if (action === "inviteTeacher") {
        enqueueToast("Teacher invite sent", "Invitation is pending acceptance.", "Open Invites", () => jumpToSection("teachers"));
      }
      if (action === "upsertLicence") {
        enqueueToast("Licence updated", "Licence limits and billing policy were updated.", "Open Licence Panel", () => {
          const node = document.getElementById("school-licence");
          node?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      if (action === "updateSchool") {
        const nextStatus = typeof payload.status === "string" ? payload.status : null;
        if (nextStatus === "suspended") {
          enqueueToast("School suspended", "Operational access posture has changed.", "View Timeline", () => {
            const node = document.getElementById("school-timeline");
            node?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      }
      void refreshLiveSnapshot();
      return { ok: true, schools: nextSchools };
    } catch {
      setError("Unable to save school changes.");
      return { ok: false, schools: [] as SchoolRecord[] };
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/admin/schools", { credentials: "include" }),
      fetch("/api/admin/students", { credentials: "include" }),
    ])
      .then(async ([schoolsResponse, studentsResponse]) => {
        if (!active) return;

        if (!schoolsResponse.ok) {
          setError("Unable to load schools.");
          setLoading(false);
          return;
        }

        const schoolsPayload = (await schoolsResponse.json()) as { schools: SchoolRecord[] };
        const nextSchools = schoolsPayload.schools ?? [];
        setSchools(nextSchools);

        if (studentsResponse.ok) {
          const studentsPayload = (await studentsResponse.json()) as {
            students: Array<{ id: string; name: string; parentEmail: string }>;
          };
          setStudents((studentsPayload.students ?? []).map((row) => ({ id: row.id, name: row.name, parentEmail: row.parentEmail })));
        } else {
          setStudents([]);
        }

        applySchoolSelection(nextSchools[0] ?? null);
        void loadTrustData();
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Unable to load schools.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSchoolId) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ schoolId: selectedSchoolId, limit: "200" });
    const actionFilter = auditActionFilter.trim();
    const actorFilter = auditActorFilter.trim();
    if (auditSeverityFilter !== "all") params.set("severity", auditSeverityFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (actorFilter) params.set("actorUserId", actorFilter);

    const loadAuditTrail = async () => {
      setAuditLoading(true);
      try {
        const response = await fetch(`/api/admin/schools/audit?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const data = (await response.json()) as { items?: SchoolAuditApiItem[] };
        const items = data.items ?? [];
        setAuditTrail(
          items.map((item) => ({
            id: item.id,
            timestamp: item.createdAt,
            action: item.action,
            details: `${item.entityType}${item.entityId ? ` • ${item.entityId}` : ""}`,
            severity: item.severity,
            actorUserId: item.actorUserId,
            source: item.source,
            operation: item.operation,
          })),
        );
      } catch {
        // no-op: keep prior audit state when the request fails or is aborted
      } finally {
        setAuditLoading(false);
      }
    };

    void loadAuditTrail();
    return () => {
      controller.abort();
    };
  }, [selectedSchoolId, auditSeverityFilter, auditActionFilter, auditActorFilter]);

  async function loadProvisioningHistory(schoolIdParam?: string) {
    const targetSchoolId = schoolIdParam ?? selectedSchoolId;
    if (!targetSchoolId) {
      setProvisioningHistory([]);
      return;
    }
    setProvisioningHistoryLoading(true);
    try {
      const response = await fetch(`/api/admin/schools/provisioning/jobs?schoolId=${encodeURIComponent(targetSchoolId)}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { jobs?: ProvisioningJobRecord[] };
      setProvisioningHistory(data.jobs ?? []);
    } catch {
      // no-op
    } finally {
      setProvisioningHistoryLoading(false);
    }
  }

  async function onProvisioningJobAction(jobId: string, action: "retry" | "cancel") {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/schools/provisioning/jobs/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        setError(`Unable to ${action} provisioning job.`);
        return;
      }
      setMessage(`Provisioning job ${action} requested.`);
      await loadProvisioningHistory();
      if (selectedSchoolId) {
        void fetch(`/api/admin/schools/audit?schoolId=${encodeURIComponent(selectedSchoolId)}&limit=200`, { credentials: "include" });
      }
    } catch {
      setError(`Unable to ${action} provisioning job.`);
    } finally {
      setSaving(false);
    }
  }

  async function onRunProvisioningRunner() {
    setProvisioningRunnerBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools/provisioning/runner", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        setError("Unable to run provisioning runner.");
        return;
      }
      const data = (await response.json()) as { processed?: number };
      setMessage(`Provisioning runner processed ${data.processed ?? 0} job(s).`);
      await loadProvisioningHistory();
    } catch {
      setError("Unable to run provisioning runner.");
    } finally {
      setProvisioningRunnerBusy(false);
    }
  }

  async function loadTrustData() {
    setTrustsLoading(true);
    try {
      const [trustsResponse, batchesResponse] = await Promise.all([
        fetch("/api/admin/schools/trusts", { credentials: "include" }),
        fetch("/api/admin/schools/bulk-onboarding", { credentials: "include" }),
      ]);

      if (trustsResponse.ok) {
        const trustsPayload = (await trustsResponse.json()) as { trusts?: TrustRecord[] };
        const nextTrusts = trustsPayload.trusts ?? [];
        setTrusts(nextTrusts);
        if (!selectedTrustId && nextTrusts[0]) {
          setSelectedTrustId(nextTrusts[0].id);
        }
      }
      if (batchesResponse.ok) {
        const batchesPayload = (await batchesResponse.json()) as { batches?: BulkBatchRecord[] };
        setBulkBatches(batchesPayload.batches ?? []);
      }
    } catch {
      // no-op
    } finally {
      setTrustsLoading(false);
    }
  }

  async function onCreateOrUpdateTrust() {
    if (!trustName.trim() || !trustCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools/trusts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trustName.trim(),
          code: trustCode.trim(),
          headquartersRegion: trustRegion,
        }),
      });
      if (!response.ok) {
        setError("Unable to create trust.");
        return;
      }
      setMessage("Trust saved.");
      setTrustName("");
      setTrustCode("");
      await loadTrustData();
    } catch {
      setError("Unable to create trust.");
    } finally {
      setSaving(false);
    }
  }

  async function onAttachSelectedSchoolToTrust() {
    if (!selectedTrustId || !selectedSchoolId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools/trusts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "attachSchool",
          payload: {
            trustId: selectedTrustId,
            schoolId: selectedSchoolId,
            roleInTrust: "member",
          },
        }),
      });
      if (!response.ok) {
        setError("Unable to attach school to trust.");
        return;
      }
      setMessage("School attached to trust.");
      await loadTrustData();
    } catch {
      setError("Unable to attach school to trust.");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateBulkBatch() {
    const rows = bulkRowsInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => ({
        name,
        slug: slugify(name),
        type: "school",
        status: "pilot",
      }));

    if (!rows.length) return;

    setBulkLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools/bulk-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          trustId: selectedTrustId || undefined,
          sourceType: "manual",
          dryRun: bulkDryRun,
          rows,
        }),
      });
      if (!response.ok) {
        setError("Unable to create bulk onboarding batch.");
        return;
      }
      setMessage("Bulk onboarding batch created.");
      await loadTrustData();
    } catch {
      setError("Unable to create bulk onboarding batch.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function onExecuteBulkBatch(batchId: string) {
    setBulkLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools/bulk-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: "execute", payload: { batchId } }),
      });
      if (!response.ok) {
        setError("Unable to execute bulk onboarding batch.");
        return;
      }
      setMessage("Bulk onboarding batch execution started.");
      await loadTrustData();
      await refreshLiveSnapshot();
    } catch {
      setError("Unable to execute bulk onboarding batch.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function loadNotificationData(schoolIdParam?: string) {
    const targetSchoolId = schoolIdParam ?? selectedSchoolId;
    if (!targetSchoolId) {
      setNotificationPrefs([]);
      setNotificationEvents([]);
      return;
    }
    setNotificationsLoading(true);
    try {
      const [prefsResponse, eventsResponse] = await Promise.all([
        fetch(`/api/admin/schools/notifications/preferences?schoolId=${encodeURIComponent(targetSchoolId)}`, { credentials: "include" }),
        fetch(`/api/admin/schools/notifications/events?schoolId=${encodeURIComponent(targetSchoolId)}`, { credentials: "include" }),
      ]);

      if (prefsResponse.ok) {
        const prefsPayload = (await prefsResponse.json()) as { preferences?: NotificationPreferenceRecord[] };
        const nextPrefs = prefsPayload.preferences ?? [];
        setNotificationPrefs(nextPrefs);
        if (nextPrefs[0]) {
          setPrefEventType(nextPrefs[0].eventType ?? "safeguarding.alert");
          setPrefEmailEnabled(nextPrefs[0].emailEnabled);
          setPrefSmsEnabled(nextPrefs[0].smsEnabled);
          setPrefWhatsAppEnabled(nextPrefs[0].whatsappEnabled);
          setPrefMinSeverity(nextPrefs[0].minSeverity);
        }
      }
      if (eventsResponse.ok) {
        const eventsPayload = (await eventsResponse.json()) as { events?: NotificationEventRecord[] };
        setNotificationEvents(eventsPayload.events ?? []);
      }
    } catch {
      // no-op
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function onSaveNotificationPreference() {
    if (!selectedSchoolId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          schoolId: selectedSchoolId,
          eventType: prefEventType,
          emailEnabled: prefEmailEnabled,
          smsEnabled: prefSmsEnabled,
          whatsappEnabled: prefWhatsAppEnabled,
          minSeverity: prefMinSeverity,
        }),
      });
      if (!response.ok) {
        setError("Unable to save notification preference.");
        return;
      }
      setMessage("Notification preference saved.");
      await loadNotificationData();
    } catch {
      setError("Unable to save notification preference.");
    } finally {
      setSaving(false);
    }
  }

  async function onManualNotificationDispatch() {
    if (!selectedSchoolId) return;
    setSaving(true);
    setError(null);
    try {
      let payloadObject: Record<string, unknown> = {};
      try {
        payloadObject = JSON.parse(manualEventPayload) as Record<string, unknown>;
      } catch {
        setError("Manual event payload must be valid JSON.");
        return;
      }

      const createResponse = await fetch("/api/admin/schools/notifications/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          schoolId: selectedSchoolId,
          eventType: manualEventType,
          severity: manualEventSeverity,
          payload: payloadObject,
        }),
      });
      if (!createResponse.ok) {
        setError("Unable to create notification event.");
        return;
      }

      const dispatchResponse = await fetch("/api/admin/schools/notifications/dispatch", {
        method: "POST",
        credentials: "include",
      });
      if (!dispatchResponse.ok) {
        setError("Event created, but dispatch failed.");
        return;
      }

      setMessage("Manual notification event dispatched.");
      await loadNotificationData();
    } catch {
      setError("Unable to dispatch notification event.");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedSchoolName = createName;

    const createNotes = [
      createLicenceTier ? `Requested licence tier: ${createLicenceTier}` : null,
      createPriority ? `Onboarding priority: ${createPriority}` : null,
      createRegion ? `Region: ${createRegion}` : null,
      createRegionComplianceProfile ? `Region compliance profile: ${regionComplianceProfileLabel}` : null,
      createCommunicationPreferences ? `Communication preferences: ${communicationPreferenceLabel}` : null,
      createParentOnboardingMode ? `Parent onboarding mode: ${parentOnboardingModeLabel}` : null,
      createRetentionStrategy ? `Retention strategy: ${retentionStrategyLabel}` : null,
      createEscalationChain ? `Escalation chain: ${escalationChainLabel}` : null,
      createSafeguardingWorkflow ? `Safeguarding workflow: ${safeguardingWorkflowLabel}` : null,
      createApprovalWorkflow ? `Approval workflow: ${approvalWorkflowLabel}` : null,
      createLaunchTarget ? `Target launch date: ${createLaunchTarget}` : null,
      createOnboardingBrief ? `Ops brief: ${createOnboardingBrief}` : null,
      createSafeguardingLead ? `Safeguarding lead: ${createSafeguardingLead}` : null,
      createDslContact ? `DSL contact: ${createDslContact}` : null,
      createDataRetention ? `Data retention: ${createDataRetention}` : null,
    ].filter(Boolean).join(" | ");

    const createResult = await postAction("createSchool", {
      name: createName,
      status: createStatus,
      type: createType,
      contactEmail: createEmail,
      contactPhone: createPhone,
      notes: createNotes || undefined,
    });
    if (!createResult?.ok) return;

    const createdSchool =
      createResult.schools.find((school) => school.name === requestedSchoolName)
      ?? createResult.schools[0]
      ?? null;

    setIsProvisioning(true);
    setProvisioningJobId(null);
    setProvisioningSteps(PROVISIONING_STEPS.map(step => ({ ...step, status: "pending" as const })));
    setProvisioningComplete(false);

    if (backendProvisioningEnabled && createdSchool) {
      try {
        const provisioningResponse = await fetch("/api/admin/schools/provisioning/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            schoolId: createdSchool.id,
            request: {
              onboardingPriority: createPriority,
              launchTarget: createLaunchTarget,
            },
          }),
        });
        if (provisioningResponse.ok) {
          const provisioningData = (await provisioningResponse.json()) as { jobId?: string };
          if (provisioningData.jobId) setProvisioningJobId(provisioningData.jobId);
        }
      } catch {
        // no-op: fall back to visual pending state
      }
    }

    const schoolCode = `SC-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    setCreatedSchoolInfo({
      id: createdSchool?.id ?? `school-${Date.now()}`,
      name: createName,
      code: schoolCode,
      licenceTier: createLicenceTier,
      onboardingPriority: createPriority,
      region: createRegion,
      launchTarget: createLaunchTarget,
      safeguardingLead: createSafeguardingLead,
      dslContact: createDslContact,
      dataRetention: createDataRetention,
      regionComplianceProfile: createRegionComplianceProfile,
      communicationPreferences: createCommunicationPreferences,
      parentOnboardingMode: createParentOnboardingMode,
      retentionStrategy: createRetentionStrategy,
      escalationChain: createEscalationChain,
      safeguardingWorkflow: createSafeguardingWorkflow,
      approvalWorkflow: createApprovalWorkflow,
    });

    clearDraftFromStorage();
    setDraftRestoredIndicator(false);

    setCreateName("");
    setCreateEmail("");
    setCreatePhone("");
    setCreateLicenceTier("starter");
    setCreatePriority("standard");
    setCreateRegion("UK South");
    setCreateRegionComplianceProfile("");
    setCreateCommunicationPreferences("");
    setCreateParentOnboardingMode("");
    setCreateLaunchTarget("");
    setCreateOnboardingBrief("");
    setCreateSafeguardingLead("");
    setCreateDslContact("");
    setCreateDataRetention("standard");
    setCreateWizardStep(1);
    setCreateConfirmChecked(false);
  }

  async function onSaveSchoolProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool) return;
    await postAction("updateSchool", {
      schoolId: selectedSchool.id,
      name: editSchoolName,
      status: editSchoolStatus,
      type: editSchoolType,
      contactEmail: editSchoolEmail || undefined,
      contactPhone: editSchoolPhone || undefined,
      notes: editSchoolNotes || undefined,
    });
  }

  async function onSaveLicence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool) return;
    await postAction("upsertLicence", {
      schoolId: selectedSchool.id,
      status: licenceStatus,
      seatLimit: Number(licenceSeatLimit) || 0,
      provider: licenceProvider,
      billingInterval: licenceInterval,
      trialEndsAt: dateInputToIso(licenceTrialEndsAt),
      currentPeriodEnd: dateInputToIso(licenceCurrentPeriodEnd),
    });
  }

  async function onCreateClassroom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool) return;
    await postAction("createClassroom", {
      schoolId: selectedSchool.id,
      name: classroomName,
      yearGroup: classroomYearGroup || undefined,
      academicYear: classroomAcademicYear || undefined,
      teacherId: classroomTeacherId || null,
    });
    setClassroomName("");
    setClassroomYearGroup("");
    setClassroomAcademicYear("");
    setClassroomTeacherId("");
  }

  async function onInviteTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool) return;
    await postAction("inviteTeacher", {
      schoolId: selectedSchool.id,
      email: teacherEmail,
      name: teacherName || undefined,
      role: teacherRole,
      title: teacherTitle || undefined,
    });
    setTeacherEmail("");
    setTeacherName("");
    setTeacherTitle("");
    setTeacherRole("teacher");
  }

  async function onAssignStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool) return;
    await postAction("assignStudent", {
      schoolId: selectedSchool.id,
      childId: assignChildId,
      classroomId: assignClassroomId || null,
      externalRef: assignExternalRef || null,
      status: "active",
    });
    setAssignChildId("");
    setAssignClassroomId("");
    setAssignExternalRef("");
  }

  async function onExportStudent(studentId: string, childName: string) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "exportStudentData", payload: { schoolStudentId: studentId } }),
      });

      const data = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Unable to export student data.");
        return;
      }

      const filename = `${childName.replace(/\s+/g, "-").toLowerCase()}-admin-export.json`;
      downloadJson(filename, data);
      setMessage(`Exported ${childName}.`);
      enqueueToast("Export generated", `${childName} export is ready.`, "Download Again", () => downloadJson(filename, data));
    } catch {
      setError("Unable to export student data.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteRequest(studentId: string, childName: string) {
    const reason = window.prompt(`Why are you requesting deletion for ${childName}?`);
    if (!reason) return;

    await postAction("requestDeleteStudentData", {
      schoolStudentId: studentId,
      reason,
    });
  }

  function jumpToSection(section: "dashboard" | "teachers" | "safeguarding" | "communication" | "exports") {
    setFocusedOpsSection(section);
    if (section === "safeguarding") {
      setShowSafeguardingDetails(true);
    }
    if (section === "communication") {
      setShowCommunicationAudit(true);
    }
    if (section === "exports") {
      setShowCompliance(true);
    }
    const sectionId = `school-${section}`;
    setTimeout(() => {
      const node = document.getElementById(sectionId);
      node?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  function getProvisioningTargetSchool(): SchoolRecord | null {
    if (createdSchoolInfo?.name) {
      const matchingSchools = schools.filter((school) => school.name === createdSchoolInfo.name);
      if (matchingSchools.length > 0) {
        return matchingSchools.reduce((latest, current) =>
          new Date(current.createdAt).getTime() > new Date(latest.createdAt).getTime() ? current : latest,
        );
      }
    }

    return schools.find((school) => school.id === selectedSchoolId) ?? schools[schools.length - 1] ?? null;
  }

  function routeProvisioningAction(
    section: "dashboard" | "teachers" | "safeguarding" | "communication" | "exports",
    options?: { openInvites?: boolean; openEnrolments?: boolean; openCompliance?: boolean },
  ) {
    const targetSchool = getProvisioningTargetSchool();
    if (!targetSchool) return;
    applySchoolSelection(targetSchool);

    if (options?.openInvites) {
      setShowInvites(true);
    }
    if (options?.openEnrolments) {
      setShowEnrolments(true);
    }
    if (options?.openCompliance) {
      setShowCompliance(true);
    }

    jumpToSection(section);
  }

  function downloadJson(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  async function onExportAuditCsv() {
    if (!selectedSchoolId) return;

    setAuditExporting(true);
    try {
      const params = new URLSearchParams({ schoolId: selectedSchoolId, format: "csv", limit: "200" });
      const actionFilter = auditActionFilter.trim();
      const actorFilter = auditActorFilter.trim();
      if (auditSeverityFilter !== "all") params.set("severity", auditSeverityFilter);
      if (actionFilter) params.set("action", actionFilter);
      if (actorFilter) params.set("actorUserId", actorFilter);

      const response = await fetch(`/api/admin/schools/audit?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        setError("Unable to export audit CSV.");
        return;
      }

      const content = await response.text();
      const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      const safeName = (selectedSchool?.name ?? "school").replace(/\s+/g, "-").toLowerCase();
      anchor.download = `${safeName}-audit.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage("Audit CSV exported.");
    } catch {
      setError("Unable to export audit CSV.");
    } finally {
      setAuditExporting(false);
    }
  }

  async function onExportSchoolData(schoolId: string, schoolName: string) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "exportSchoolData", payload: { schoolId } }),
      });

      const data = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Unable to export school data.");
        return;
      }

      const filename = `${schoolName.replace(/\s+/g, "-").toLowerCase()}-school-export.json`;
      downloadJson(filename, data);
      setMessage(`Exported ${schoolName}.`);
      enqueueToast("Export generated", `${schoolName} export is ready.`, "Download Again", () => downloadJson(filename, data));
    } catch {
      setError("Unable to export school data.");
    } finally {
      setSaving(false);
    }
  }

  async function onSuspendSchool(school: SchoolRecord) {
    await postAction("updateSchool", {
      schoolId: school.id,
      name: school.name,
      type: school.type,
      status: "suspended",
      contactEmail: school.contactEmail || undefined,
      contactPhone: school.contactPhone || undefined,
      notes: school.notes || undefined,
      ownerUserId: school.ownerUserId || undefined,
    });
  }

  function applySavedView(name: SavedViewName) {
    const preset = SAVED_OPERATIONAL_VIEWS.find((view) => view.name === name);
    if (!preset) return;
    setActiveSavedView(name);
    setQuickFilters(preset.filters);
    setFocusedOpsSection(preset.focus);
  }

  function updateOwnershipField(schoolId: string, key: keyof OwnershipRecord, value: string) {
    setOwnershipBySchool((prev) => {
      const existing = prev[schoolId] ?? { reviewer: "", safeguardingLead: "", complianceOfficer: "" };
      return {
        ...prev,
        [schoolId]: {
          ...existing,
          [key]: value,
        },
      };
    });
  }

  const hasProfileName = createName.trim().length > 0;
  const hasProfileContact = createEmail.trim().length > 0 || createPhone.trim().length > 0;
  const emailLooksValid = createEmail.trim().length === 0 || /.+@.+\..+/.test(createEmail);
  const launchDateReady = createLaunchTarget.trim().length > 0;
  const briefReady = createOnboardingBrief.trim().length >= 24;
  const regionReady = createRegion.trim().length > 0;
  const canAdvanceToStep2 = hasProfileName && emailLooksValid;
  const canAdvanceToStep3 = launchDateReady && regionReady;
  const canSubmitWizard = canAdvanceToStep2 && canAdvanceToStep3 && createConfirmChecked;
  const filteredTrusts = useMemo(() => {
    const query = trustSearch.trim().toLowerCase();
    if (!query) return trusts;
    return trusts.filter((trust) =>
      trust.name.toLowerCase().includes(query)
      || trust.code.toLowerCase().includes(query)
      || (trust.headquartersRegion ?? "").toLowerCase().includes(query),
    );
  }, [trustSearch, trusts]);

  const regionalTrustOverview = useMemo(() => {
    const map = new Map<string, { trusts: number; schools: number }>();
    for (const trust of trusts) {
      const region = trust.headquartersRegion ?? "Unassigned";
      const current = map.get(region) ?? { trusts: 0, schools: 0 };
      current.trusts += 1;
      current.schools += trust._count?.schoolMemberships ?? 0;
      map.set(region, current);
    }
    return Array.from(map.entries()).map(([region, values]) => ({ region, ...values }));
  }, [trusts]);

  const latestProvisioningFailure = useMemo(() => {
    const failedJob = provisioningHistory.find((job) => job.status === "failed" || job.status === "retry_scheduled");
    if (!failedJob) return null;
    const failedStep = failedJob.stepRuns.find((step) => step.status === "failed") ?? null;
    return { job: failedJob, step: failedStep };
  }, [provisioningHistory]);

  return (
    <div className="space-y-6 pt-20 lg:pt-24">
      {toasts.length ? (
        <aside className="fixed right-4 top-24 z-40 flex w-80 flex-col gap-2">
          {toasts.map((toast) => (
            <article key={toast.id} className="rounded-xl border border-indigo-400/40 bg-slate-950/90 p-3 shadow-xl">
              <p className="text-sm font-semibold text-indigo-100">{toast.title}</p>
              <p className="mt-1 text-xs text-slate-300">{toast.detail}</p>
              {toast.actionLabel && toast.onAction ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.onAction?.();
                    setToasts((prev) => prev.filter((item) => item.id !== toast.id));
                  }}
                  className="mt-2 rounded-md border border-indigo-400/40 bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-100"
                >
                  {toast.actionLabel}
                </button>
              ) : null}
            </article>
          ))}
        </aside>
      ) : null}

      <section className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Admin Console</p>
        <h1 className="mt-2 text-2xl font-black text-white">Schools &amp; Governance</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Operate the full school lifecycle from onboarding to safeguarding oversight. This workspace now separates creation,
          operations, and governance so school teams can act quickly and safely.
        </p>
      </section>

      <section className="sticky top-20 z-30 rounded-2xl border border-slate-700/80 bg-slate-950/80 p-3 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => jumpToSection("dashboard")} className={subtleButtonClass}>Overview</button>
          <button onClick={() => jumpToSection("teachers")} className={subtleButtonClass}>Operations</button>
          <button onClick={() => jumpToSection("communication")} className={subtleButtonClass}>Governance</button>
          <button onClick={() => jumpToSection("exports")} className={subtleButtonClass}>Compliance</button>
          <button onClick={() => jumpToSection("safeguarding")} className={subtleButtonClass}>Safeguarding</button>
        </div>
      </section>

      {loading ? <p className="text-sm text-slate-400">Loading school workspace...</p> : null}
      {error ? <p className="rounded-xl border border-rose-600/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

      <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
        <p className="text-sm font-semibold text-white">Saved Operational Views</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAVED_OPERATIONAL_VIEWS.map((view) => (
            <button
              key={view.name}
              type="button"
              onClick={() => applySavedView(view.name)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activeSavedView === view.name
                ? "border-indigo-400/70 bg-indigo-500/25 text-indigo-100"
                : "border-slate-600 bg-slate-900/50 text-slate-300 hover:bg-slate-800/70"
                }`}
            >
              {view.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setActiveSavedView(null);
              setQuickFilters({ ...DEFAULT_QUICK_FILTERS });
              setFocusedOpsSection("dashboard");
            }}
            className={subtleButtonClass}
          >
            Default View
          </button>
        </div>
        {activeSavedView ? (
          <article className="mt-3 rounded-xl border border-indigo-400/40 bg-indigo-500/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Operational Mode Active</p>
            <p className="mt-1 text-sm font-semibold text-white">{activeSavedView}</p>
            <p className="mt-1 text-xs text-indigo-100">{getSavedViewPreset(activeSavedView)?.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(getSavedViewPreset(activeSavedView)?.filtersApplied ?? []).map((label) => (
                <span key={label} className="rounded-full border border-indigo-400/40 bg-indigo-500/20 px-2 py-1 text-[10px] font-semibold text-indigo-100">{label}</span>
              ))}
            </div>
          </article>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-indigo-500/40 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-indigo-200">Schools</p>
          <p className="mt-2 text-4xl font-black text-white">{portfolioMetrics.schoolsCount}</p>
          <p className="text-[11px] text-slate-300">Mode: {activeSavedView ?? "Default"}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-200">Active Students</p>
          <p className="mt-2 text-4xl font-black text-white">{portfolioMetrics.activeStudents}</p>
          <p className="text-[11px] text-slate-300">Unplaced: {trendAnalytics.studentsWithoutClassroom}</p>
        </div>
        <div className="rounded-2xl border border-sky-500/30 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-sky-200">Teachers</p>
          <p className="mt-2 text-4xl font-black text-white">{portfolioMetrics.activeTeachers}</p>
          <p className="text-[11px] text-slate-300">Inactive schools: {liveSnapshotCards.teacherInactivitySchools}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-200">Licence Usage</p>
          <p className="mt-2 text-4xl font-black text-white">
            {portfolioMetrics.totalSeatsUsed}/{portfolioMetrics.totalSeatLimit > 0 ? portfolioMetrics.totalSeatLimit : "inf"}
          </p>
          <p className="text-[11px] text-slate-300">{seatUtilizationPct !== null ? `Utilization ${seatUtilizationPct}%` : "Unlimited capacity"}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/30 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-rose-200">Safeguarding Alerts</p>
          <p className="mt-2 text-4xl font-black text-rose-100">{portfolioMetrics.safeguardingAlerts}</p>
          <p className="text-[11px] text-slate-300">{safeguardingDelta >= 0 ? `^ ${safeguardingDelta}` : `v ${Math.abs(safeguardingDelta)}`} vs previous 7d</p>
        </div>
      </section>

      {escalationQueue.length > 0 ? (
        <section className="rounded-2xl border border-rose-500/45 bg-linear-to-r from-rose-950/70 via-slate-950/80 to-orange-950/60 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-rose-100">Escalation Queue</p>
              <p className="mt-1 text-xs text-rose-100/90">
                {escalationQueue.length === 1
                  ? "1 school requires immediate operational intervention."
                  : `${escalationQueue.length} schools require immediate operational intervention.`}
              </p>
            </div>
            <span className="rounded-full border border-rose-400/40 bg-rose-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
              Governance Priority
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["All", "Critical", "High", "Medium", "Low"].map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev as EscalationSeverity | "All")}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${severityFilter === sev
                  ? "border-rose-400/60 bg-rose-500/25 text-rose-100"
                  : "border-slate-600 bg-slate-900/50 text-slate-300 hover:bg-slate-800/70"
                  }`}
              >
                {sev === "All" ? "All Severities" : `${sev} Only`}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            {escalationQueue.map((entry) => (
              <article key={entry.school.id} className="grid gap-4 rounded-xl border border-rose-400/30 bg-slate-950/65 p-4 lg:grid-cols-[1fr_1.3fr_1fr]">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-300/35 bg-rose-500/20 text-sm font-bold text-rose-100">
                      {initialsFromSchool(entry.school.name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{entry.school.name}</p>
                      <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${severityClass(entry.severity)}`}>
                        {entry.severity} Risk
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                    <span>Escalated {entry.escalatedAt ? timeAgo(entry.escalatedAt) : "-"} ago</span>
                    <span>Owner: {entry.owner}</span>
                    <span>SLA: {typeof entry.slaHrsRemaining === "number" ? `${entry.slaHrsRemaining}h remaining` : "-"}</span>
                    <span>Status: {entry.status}</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    AI insight: {entry.aiInsight}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Risk Indicators</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.signals.map((signal) => (
                        <span key={`${entry.school.id}-${signal.label}`} className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${severityClass(signal.severity)}`}>
                          {signal.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Why This Was Escalated</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-200">
                      {entry.reasons.map((reason) => (
                        <li key={`${entry.school.id}-reason-${reason}`}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-rose-200">Severity Score</p>
                    <p className="mt-1 text-xl font-black text-rose-100">{entry.severityScore}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { applySchoolSelection(entry.school); jumpToSection("communication"); }} className={subtleButtonClass}>Open Governance Workspace</button>
                    <button onClick={() => { applySchoolSelection(entry.school); jumpToSection("teachers"); }} className={subtleButtonClass}>Assign Staff</button>
                    <button onClick={() => { applySchoolSelection(entry.school); jumpToSection("communication"); }} className={subtleButtonClass}>Contact School</button>
                    <button onClick={() => { applySchoolSelection(entry.school); jumpToSection("dashboard"); }} className={subtleButtonClass}>Launch Intervention</button>
                    <button onClick={() => { applySchoolSelection(entry.school); jumpToSection("safeguarding"); }} className={subtleButtonClass}>View Safeguarding</button>
                    <button onClick={() => {
                      applySchoolSelection(entry.school);
                      enqueueToast("Incident summary generated", `${entry.school.name}: ${entry.reasons.join("; ")}`, "Open Compliance", () => jumpToSection("exports"));
                    }} className={subtleButtonClass}>Generate Incident Summary</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className={panelClass}>
          <p className="text-xs uppercase tracking-wide text-slate-400">Safeguarding Trend</p>
          <p className="mt-2 text-2xl font-black text-white">{trendAnalytics.safeguardingLast7}</p>
          <p className="text-xs text-slate-400">Incidents in last 7 days (prev 7: {trendAnalytics.safeguardingPrev7})</p>
        </div>
        <div className={panelClass}>
          <p className="text-xs uppercase tracking-wide text-slate-400">Intervention Effectiveness</p>
          <p className="mt-2 text-2xl font-black text-white">{Math.max(0, trendAnalytics.safeguardingLast7 - trendAnalytics.unresolvedSafeguarding)}</p>
          <p className="text-xs text-slate-400">Resolved or de-escalated safeguarding actions</p>
        </div>
        <div className={panelClass}>
          <p className="text-xs uppercase tracking-wide text-slate-400">Engagement / Assignment Risk</p>
          <p className="mt-2 text-2xl font-black text-white">{trendAnalytics.studentsWithoutClassroom}</p>
          <p className="text-xs text-slate-400">Active students without classroom placement</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
        <p className="text-sm font-semibold text-white">Cross-School Performance Heatmap</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {!schools.length ? (
            <>
              <article className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3 text-xs text-slate-400">Heatmap cell pending: no schools onboarded yet.</article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3 text-xs text-slate-400">Add at least one school to enable risk surface visualization.</article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3 text-xs text-slate-400">Cells will show composite scoring across licence, staffing, and safeguarding.</article>
            </>
          ) : null}
          {schools.map((school) => {
            const risk = schoolRiskState(school);
            const riskScore = Number(risk.hasLicenceRisk) + Number(risk.hasSafeguardingRisk) + Number(risk.seatFull) + Number(risk.activeTeachers === 0);
            const heatClass = riskScore >= 3
              ? "border-rose-500/40 bg-rose-500/15"
              : riskScore === 2
                ? "border-amber-500/40 bg-amber-500/15"
                : "border-emerald-500/30 bg-emerald-500/10";
            return (
              <article key={school.id} className={`rounded-xl border p-3 ${heatClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{school.name}</p>
                  <span className="text-[11px] font-semibold text-slate-100">Risk {riskScore}/4</span>
                </div>
                <p className="mt-1 text-xs text-slate-200">Students {school.students.filter((row) => row.status === "active").length} · Teachers {risk.activeTeachers}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-indigo-100">Live Operations Center</p>
          <span className="rounded-full border border-indigo-400/40 bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-100">
            Live via {liveTransport}
          </span>
        </div>
        <p className="mt-1 text-xs text-indigo-200">
          Snapshot widgets are now event-driven. Last refresh {liveUpdatedAt ? shortDateTime(liveUpdatedAt) : "pending"}.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-xl border border-indigo-400/30 bg-slate-950/50 p-3 text-xs text-slate-200">Live alerts queue: {liveSnapshotCards.escalationQueueCount}</article>
          <article className="rounded-xl border border-indigo-400/30 bg-slate-950/50 p-3 text-xs text-slate-200">Active incidents: {liveSnapshotCards.unresolvedSafeguarding}</article>
          <article className="rounded-xl border border-indigo-400/30 bg-slate-950/50 p-3 text-xs text-slate-200">Communication failures (24h): {liveSnapshotCards.communicationFailures24h}</article>
          <article className="rounded-xl border border-indigo-400/30 bg-slate-950/50 p-3 text-xs text-slate-200">Suspension events (24h): {liveSnapshotCards.suspensionEvents24h}</article>
          <article className="rounded-xl border border-indigo-400/30 bg-slate-950/50 p-3 text-xs text-slate-200">Teacher inactivity: {liveSnapshotCards.teacherInactivitySchools}</article>
          <article className="rounded-xl border border-indigo-400/30 bg-slate-950/50 p-3 text-xs text-slate-200">Auth anomaly signals (15m): {liveSnapshotCards.authAnomalySignals}</article>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Quick Filters</p>
          <button
            type="button"
            onClick={() => setQuickFilters({
              licenceRisk: false,
              safeguardingRisk: false,
              suspendedSchools: false,
              seatCapacity: false,
              noActiveTeachers: false,
              expiringLicences: false,
            })}
            className={subtleButtonClass}
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setQuickFilters((prev) => ({ ...prev, [filter.key]: !prev[filter.key] }))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${quickFilters[filter.key]
                ? "border-indigo-400/60 bg-indigo-500/25 text-indigo-100"
                : "border-slate-600 bg-slate-900/50 text-slate-300 hover:bg-slate-800/70"
                }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <AdminSectionCard title="Create School Panel" eyebrow="Onboarding">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_1.35fr]">
          <aside className="space-y-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
            <p className="text-sm font-semibold text-white">What happens after creation</p>
            <ol className="space-y-2 text-sm text-slate-200">
              <li>[1] Workspace created with governance tracking enabled.</li>
              <li>[2] Select licence posture and configure seat limits.</li>
              <li>[3] Invite teachers, create classrooms, and enrol students.</li>
              <li>[4] Communication, compliance, and safeguarding streams activate.</li>
            </ol>
            <div className="rounded-xl border border-indigo-400/25 bg-slate-950/35 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Wizard Progress</p>
              <div className="mt-2 h-2 rounded-full bg-slate-800">
                <div className={`h-2 rounded-full bg-indigo-400 transition-all duration-300 ${createWizardStep === 1 ? "w-1/3" : createWizardStep === 2 ? "w-2/3" : "w-full"}`} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setCreateWizardStep(1)}
                  className={createWizardStep === 1 ? "text-indigo-100" : "text-slate-300"}
                >
                  01 School Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canAdvanceToStep2) return;
                    setCreateWizardStep(2);
                  }}
                  className={createWizardStep === 2 ? "text-indigo-100" : "text-slate-300"}
                >
                  02 Launch Readiness
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canAdvanceToStep3) return;
                    setCreateWizardStep(3);
                  }}
                  className={createWizardStep === 3 ? "text-indigo-100" : "text-slate-300"}
                >
                  03 Review
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">Launch Readiness Score</p>
                <button
                  type="button"
                  onClick={() => setShowLaunchReadinessDetails(!showLaunchReadinessDetails)}
                  className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                >
                  {showLaunchReadinessDetails ? "Collapse" : "Expand"}
                </button>
              </div>
              <p className="mt-2 text-2xl font-black text-white">{launchReadinessScore.overallScore}%</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                  launchReadinessScore.status === "Ready for Launch"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100 border"
                    : launchReadinessScore.status === "At Risk"
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-100 border"
                      : "border-rose-500/40 bg-rose-500/15 text-rose-100 border"
                }`}>
                  {launchReadinessScore.status}
                </span>
              </div>
              {showLaunchReadinessDetails && (
                <div className="mt-3 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Profile</span>
                    <span className="font-semibold text-sky-100">{launchReadinessScore.profileCompleteness}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Contact</span>
                    <span className="font-semibold text-sky-100">{launchReadinessScore.contactVerification}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Launch</span>
                    <span className="font-semibold text-sky-100">{launchReadinessScore.launchPlanning}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Governance</span>
                    <span className="font-semibold text-sky-100">{launchReadinessScore.governanceSetup}%</span>
                  </div>
                </div>
              )}
              {smartRecommendations.length > 0 && (
                <div className="mt-4 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-amber-200">Smart Recommendations</p>
                    <button
                      type="button"
                      onClick={() => setShowSmartRecommendations(!showSmartRecommendations)}
                      className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                    >
                      {showSmartRecommendations ? "Collapse" : "Expand"}
                    </button>
                  </div>
                  {showSmartRecommendations && smartRecommendations.slice(0, 5).map((rec) => {
                    const priorityColors = {
                      critical: "border-rose-500/40 bg-rose-500/5 text-rose-200",
                      high: "border-amber-500/40 bg-amber-500/5 text-amber-200",
                      medium: "border-sky-500/40 bg-sky-500/5 text-sky-200",
                      low: "border-emerald-500/40 bg-emerald-500/5 text-emerald-200",
                    };
                    return (
                      <div key={rec.id} className={`rounded border p-2 text-[10px] ${priorityColors[rec.priority]}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span className="font-semibold">{rec.title}</span>
                            {rec.priority === "critical" && <span>🔴</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => rec.fieldToFix && handleFixNow(rec.fieldToFix as CreateWizardField)}
                            className="rounded-full border border-current/30 px-2 py-1 font-semibold transition hover:bg-white/10"
                          >
                            Fix Now
                          </button>
                        </div>
                        <p className="mt-0.5 opacity-90">{rec.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {showAuditTrail && (
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Audit Trail</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={auditExporting || !selectedSchoolId}
                      onClick={() => void onExportAuditCsv()}
                      className="rounded border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {auditExporting ? "Exporting..." : "Export CSV"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAuditTrail(false)}
                      className="text-xs text-slate-400 hover:text-slate-200 transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="mb-2 grid gap-2 md:grid-cols-3">
                  <select
                    value={auditSeverityFilter}
                    onChange={(event) => setAuditSeverityFilter(event.target.value)}
                    className="rounded border border-slate-600 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200"
                  >
                    <option value="all">All severities</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                    <option value="critical">Critical</option>
                  </select>
                  <input
                    type="text"
                    value={auditActionFilter}
                    onChange={(event) => setAuditActionFilter(event.target.value)}
                    placeholder="Filter by action"
                    className="rounded border border-slate-600 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    value={auditActorFilter}
                    onChange={(event) => setAuditActorFilter(event.target.value)}
                    placeholder="Filter by actor user ID"
                    className="rounded border border-slate-600 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {auditLoading ? (
                    <p className="text-xs text-slate-400">Loading audit records...</p>
                  ) : auditTrail.length === 0 ? (
                    <p className="text-xs text-slate-400">No audit records match the current filters.</p>
                  ) : (
                    auditTrail.slice(0, 10).map((entry) => {
                      const severityColors = {
                        info: "border-slate-600 bg-slate-900/40 text-slate-300",
                        warning: "border-amber-500/40 bg-amber-500/5 text-amber-200",
                        error: "border-rose-500/40 bg-rose-500/5 text-rose-200",
                        critical: "border-rose-500/60 bg-rose-500/10 text-rose-100",
                      };
                      return (
                        <div key={entry.id} className={`rounded border p-2 text-[10px] ${severityColors[entry.severity as keyof typeof severityColors] ?? severityColors.info}`}>
                          <div className="flex items-start justify-between">
                            <span className="font-semibold">{entry.action}</span>
                            <span className="text-[9px] opacity-75">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="mt-0.5 opacity-90">{entry.details}</p>
                          <p className="mt-0.5 text-[9px] opacity-70">
                            Actor: {entry.actorUserId ?? "system"} • Source: {entry.source ?? "n/a"} • Operation: {entry.operation ?? "n/a"}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </aside>

          <form onSubmit={(event) => void onCreateSchool(event)} className="grid gap-4 rounded-2xl border border-slate-700/80 bg-slate-900/40 p-4 md:grid-cols-2">
            {isProvisioning || provisioningComplete ? (
              <div className="md:col-span-2">
                <ProvisioningSuccessScreenV2
                  schoolName={createdSchoolInfo?.name ?? ""}
                  schoolCode={createdSchoolInfo?.code ?? ""}
                  licenceTier={createdSchoolInfo?.licenceTier ?? createLicenceTier}
                  onboardingPriority={createdSchoolInfo?.onboardingPriority ?? createPriority}
                  region={createdSchoolInfo?.region ?? createRegion}
                  targetLaunchDate={createdSchoolInfo?.launchTarget ?? createLaunchTarget}
                  safeguardingLead={createdSchoolInfo?.safeguardingLead ?? createSafeguardingLead}
                  dslContact={createdSchoolInfo?.dslContact ?? createDslContact}
                  dataRetention={createdSchoolInfo?.dataRetention ?? createDataRetention}
                  regionComplianceProfile={createdSchoolInfo?.regionComplianceProfile ?? createRegionComplianceProfile}
                  communicationPreference={createdSchoolInfo?.communicationPreferences ?? createCommunicationPreferences}
                  parentOnboardingMode={createdSchoolInfo?.parentOnboardingMode ?? createParentOnboardingMode}
                  retentionStrategy={createdSchoolInfo?.retentionStrategy ?? createRetentionStrategy}
                  escalationChain={createdSchoolInfo?.escalationChain ?? createEscalationChain}
                  safeguardingWorkflow={createdSchoolInfo?.safeguardingWorkflow ?? createSafeguardingWorkflow}
                  approvalWorkflow={createdSchoolInfo?.approvalWorkflow ?? createApprovalWorkflow}
                  operationalMode="Standard"
                  governanceStatus="Pending Approval"
                  provisioningSteps={provisioningSteps}
                  provisioningComplete={provisioningComplete}
                  onCreateAnother={() => {
                    setProvisioningComplete(false);
                    setProvisioningJobId(null);
                    setProvisioningSteps(PROVISIONING_STEPS.map((step) => ({ ...step, status: "pending" as const })));
                    setCreatedSchoolInfo(null);
                    setCreateName("");
                    setCreateEmail("");
                    setCreatePhone("");
                    setCreateLicenceTier("starter");
                    setCreatePriority("standard");
                    setCreateRegion("UK South");
                    setCreateRegionComplianceProfile("");
                    setCreateCommunicationPreferences("");
                    setCreateParentOnboardingMode("");
                    setCreateRetentionStrategy("");
                    setCreateEscalationChain("");
                    setCreateSafeguardingWorkflow("");
                    setCreateApprovalWorkflow("");
                    setCreateLaunchTarget("");
                    setCreateOnboardingBrief("");
                    setCreateSafeguardingLead("");
                    setCreateDslContact("");
                    setCreateDataRetention("standard");
                    setCreateWizardStep(1);
                    setCreateConfirmChecked(false);
                  }}
                  onViewSchool={() => routeProvisioningAction("dashboard")}
                  onOpenWorkspace={() => routeProvisioningAction("dashboard")}
                  onInviteAdmin={() => routeProvisioningAction("teachers", { openInvites: true })}
                  onConfigureSafeguarding={() => routeProvisioningAction("safeguarding")}
                  onViewGovernance={() => routeProvisioningAction("communication")}
                  onLaunchStudentImport={() => routeProvisioningAction("teachers", { openEnrolments: true })}
                />
              </div>
            ) : (
              <>
                {draftRestoredIndicator && (
                  <div className="md:col-span-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-emerald-100">✓ Draft restored</p>
                        <p className="text-xs text-emerald-200/80">Your onboarding progress was saved automatically.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          clearDraftFromStorage();
                          setDraftRestoredIndicator(false);
                          setCreateName("");
                          setCreateEmail("");
                          setCreatePhone("");
                          setCreateLicenceTier("starter");
                          setCreatePriority("standard");
                          setCreateRegion("UK South");
                          setCreateRegionComplianceProfile("");
                          setCreateCommunicationPreferences("");
                          setCreateParentOnboardingMode("");
                          setCreateRetentionStrategy("");
                          setCreateEscalationChain("");
                          setCreateSafeguardingWorkflow("");
                          setCreateApprovalWorkflow("");
                          setCreateLaunchTarget("");
                          setCreateOnboardingBrief("");
                          setCreateSafeguardingLead("");
                          setCreateDslContact("");
                          setCreateDataRetention("standard");
                          setCreateWizardStep(1);
                          setCreateConfirmChecked(false);
                        }}
                        className="text-xs font-semibold text-emerald-300 hover:text-emerald-100 transition"
                      >
                        Clear Draft
                      </button>
                    </div>
                  </div>
                )}
                <div key={`wizard-step-${createWizardStep}`} className="md:col-span-2 grid gap-4 md:grid-cols-2 wizard-step-panel">
                  {createWizardStep === 1 ? (
              <>
                <div className="md:col-span-2 rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Step 01 · School Profile</p>
                  <p className="mt-1 text-xs text-indigo-100/90">
                    Capture the organisation identity and basic contact details before moving to launch governance.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${hasProfileName ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-amber-500/40 bg-amber-500/15 text-amber-100"}`}>Name {hasProfileName ? "Complete" : "Required"}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${hasProfileContact ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-slate-500/40 bg-slate-500/15 text-slate-200"}`}>Contact {hasProfileContact ? "Captured" : "Recommended"}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${emailLooksValid ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-rose-500/40 bg-rose-500/15 text-rose-100"}`}>Email {emailLooksValid ? "Valid" : "Fix format"}</span>
                  </div>
                </div>
                <label className="text-xs text-slate-300">Organisation Name
                  <input ref={(element) => { createFieldRefs.current.createName = element; }} value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="e.g. Northbridge Academy" required className={wizardFieldClass("createName")} />
                </label>
                <label className="text-xs text-slate-300">Organisation Type
                  <select value={createType} onChange={(event) => setCreateType(event.target.value)} className={fieldClass}>
                    <option value="school">School</option>
                    <option value="tutoring_centre">Tutoring Centre</option>
                    <option value="organisation">Organisation</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Licence Status
                  <select value={createStatus} onChange={(event) => setCreateStatus(event.target.value)} className={fieldClass}>
                    <option value="pilot">Pilot</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Licence Tier
                  <select value={createLicenceTier} onChange={(event) => setCreateLicenceTier(event.target.value)} className={fieldClass}>
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Contact Email
                  <input ref={(element) => { createFieldRefs.current.createEmail = element; }} value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} placeholder="ops@school.org" className={wizardFieldClass("createEmail")} />
                </label>
                <label className="text-xs text-slate-300">Contact Phone
                  <input ref={(element) => { createFieldRefs.current.createPhone = element; }} value={createPhone} onChange={(event) => setCreatePhone(event.target.value)} placeholder="+44..." className={wizardFieldClass("createPhone")} />
                </label>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCreateWizardStep(2)}
                    disabled={!canAdvanceToStep2}
                    className={`${primaryButtonClass} min-w-56`}
                  >
                    Continue to Launch Readiness
                  </button>
                </div>
              </>
            ) : createWizardStep === 2 ? (
              <>
                <div className="md:col-span-2 rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Step 02 · Launch Readiness & Governance</p>
                  <p className="mt-1 text-xs text-indigo-100/90">
                    Define launch expectations and governance context so operational handoff is complete from day one.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${launchDateReady ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-amber-500/40 bg-amber-500/15 text-amber-100"}`}>Launch Date {launchDateReady ? "Set" : "Required"}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${briefReady ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-slate-500/40 bg-slate-500/15 text-slate-200"}`}>Ops Brief {briefReady ? "Ready" : "Recommended"}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${regionReady ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-amber-500/40 bg-amber-500/15 text-amber-100"}`}>Region {regionReady ? "Set" : "Required"}</span>
                  </div>
                </div>
                <label className="text-xs text-slate-300">Onboarding Priority
                  <select ref={(element) => { createFieldRefs.current.createPriority = element; }} value={createPriority} onChange={(event) => setCreatePriority(event.target.value)} className={wizardFieldClass("createPriority")}>
                    <option value="standard">Standard</option>
                    <option value="accelerated">Accelerated (7-day target)</option>
                    <option value="critical">Critical (exec oversight)</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Delivery Region
                  <select ref={(element) => { createFieldRefs.current.createRegion = element; }} value={createRegion} onChange={(event) => setCreateRegion(event.target.value)} className={wizardFieldClass("createRegion")}>
                    <option value="UK South">UK South</option>
                    <option value="UK North">UK North</option>
                    <option value="Midlands">Midlands</option>
                    <option value="Scotland">Scotland</option>
                    <option value="International">International</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Target Launch Date
                  <input ref={(element) => { createFieldRefs.current.createLaunchTarget = element; }} type="date" value={createLaunchTarget} onChange={(event) => setCreateLaunchTarget(event.target.value)} className={wizardFieldClass("createLaunchTarget")} />
                </label>
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-300">
                  <p className="font-semibold text-slate-200">Implementation Owner</p>
                  <p className="mt-1">Defaults to Regional Governance Team until assignment.</p>
                </div>
                <label className="text-xs text-slate-300 md:col-span-2">Operational Brief
                  <textarea
                    ref={(element) => { createFieldRefs.current.createOnboardingBrief = element; }}
                    value={createOnboardingBrief}
                    onChange={(event) => setCreateOnboardingBrief(event.target.value)}
                    placeholder="Add context such as staffing dependencies, safeguarding sensitivities, or launch constraints."
                    rows={3}
                    className={wizardFieldClass("createOnboardingBrief")}
                  />
                </label>

                <div className="md:col-span-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Governance & Compliance</p>
                  <p className="mt-1 text-xs text-slate-400">Assign key contacts for operational oversight and data governance</p>
                </div>

                <label className="text-xs text-slate-300">Region Compliance Profile
                  <select
                    ref={(element) => { createFieldRefs.current.createRegionComplianceProfile = element; }}
                    data-testid="gov2-region-compliance"
                    value={createRegionComplianceProfile}
                    onChange={(event) => setCreateRegionComplianceProfile(event.target.value)}
                    className={wizardFieldClass("createRegionComplianceProfile")}
                  >
                    <option value="">Select compliance profile</option>
                    <option value="regional_baseline">Regional Baseline</option>
                    <option value="uk_dfe_enhanced">UK DfE Enhanced</option>
                    <option value="scotland_public_sector">Scotland Public Sector</option>
                    <option value="international_cross_border">International Cross-Border</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Controls how launch guidance maps to the region&apos;s compliance posture</p>
                </label>

                <label className="text-xs text-slate-300">Communication Preferences
                  <select
                    ref={(element) => { createFieldRefs.current.createCommunicationPreferences = element; }}
                    data-testid="gov2-communication-pref"
                    value={createCommunicationPreferences}
                    onChange={(event) => setCreateCommunicationPreferences(event.target.value)}
                    className={wizardFieldClass("createCommunicationPreferences")}
                  >
                    <option value="">Select communication preference</option>
                    <option value="email_only">Email Only</option>
                    <option value="email_sms">Email + SMS Escalations</option>
                    <option value="parent_app">Parent App Primary</option>
                    <option value="omnichannel">Omnichannel Governance</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Sets the expected delivery mix for parent comms and escalation routing</p>
                </label>

                <label className="text-xs text-slate-300">Parent Onboarding Mode
                  <select
                    ref={(element) => { createFieldRefs.current.createParentOnboardingMode = element; }}
                    data-testid="gov2-parent-mode"
                    value={createParentOnboardingMode}
                    onChange={(event) => setCreateParentOnboardingMode(event.target.value)}
                    className={wizardFieldClass("createParentOnboardingMode")}
                  >
                    <option value="">Select onboarding mode</option>
                    <option value="self_serve">Self-Serve Invites</option>
                    <option value="assisted_cohort">Admin-Assisted Cohort</option>
                    <option value="concierge">Concierge Launch Support</option>
                    <option value="hybrid_rollout">Hybrid Phased Rollout</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Determines how parents are activated before launch and during first-week support</p>
                </label>

                <label className="text-xs text-slate-300">Data Retention Strategy
                  <select
                    ref={(element) => { createFieldRefs.current.createRetentionStrategy = element; }}
                    data-testid="gov3-retention-strategy"
                    value={createRetentionStrategy}
                    onChange={(event) => setCreateRetentionStrategy(event.target.value)}
                    className={wizardFieldClass("createRetentionStrategy")}
                  >
                    <option value="">Select retention strategy</option>
                    <option value="standard_3yr">Standard (3-year)</option>
                    <option value="extended_6yr">Extended (6-year)</option>
                    <option value="archive_quarterly">Archive Quarterly</option>
                    <option value="delete_annually">Delete Annually</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Defines archival and deletion schedules for student and operational data</p>
                </label>

                <label className="text-xs text-slate-300">Escalation Chain Configuration
                  <select
                    ref={(element) => { createFieldRefs.current.createEscalationChain = element; }}
                    data-testid="gov3-escalation-chain"
                    value={createEscalationChain}
                    onChange={(event) => setCreateEscalationChain(event.target.value)}
                    className={wizardFieldClass("createEscalationChain")}
                  >
                    <option value="">Select escalation routing</option>
                    <option value="dsl_then_head">DSL then Headteacher</option>
                    <option value="safeguarding_team">Safeguarding Team</option>
                    <option value="multi_agency">Multi-Agency Escalation</option>
                    <option value="ceo_oversight">CEO/Trust Oversight</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Incident routing and safeguarding alert escalation path</p>
                </label>

                <label className="text-xs text-slate-300">Safeguarding Workflow Profile
                  <select
                    ref={(element) => { createFieldRefs.current.createSafeguardingWorkflow = element; }}
                    data-testid="gov3-safeguarding-workflow"
                    value={createSafeguardingWorkflow}
                    onChange={(event) => setCreateSafeguardingWorkflow(event.target.value)}
                    className={wizardFieldClass("createSafeguardingWorkflow")}
                  >
                    <option value="">Select workflow profile</option>
                    <option value="standard">Standard Workflow</option>
                    <option value="enhanced">Enhanced Monitoring</option>
                    <option value="critical">Critical Incident Protocol</option>
                    <option value="multi_agency">Multi-Agency Protocol</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Operational profile matching school&apos;s safeguarding capacity</p>
                </label>

                <label className="text-xs text-slate-300">Approval Workflow Process
                  <select
                    ref={(element) => { createFieldRefs.current.createApprovalWorkflow = element; }}
                    data-testid="gov3-approval-workflow"
                    value={createApprovalWorkflow}
                    onChange={(event) => setCreateApprovalWorkflow(event.target.value)}
                    className={wizardFieldClass("createApprovalWorkflow")}
                  >
                    <option value="">Select approval model</option>
                    <option value="headteacher_only">Headteacher Only</option>
                    <option value="dsl_and_head">DSL & Headteacher</option>
                    <option value="safeguarding_team">Safeguarding Team</option>
                    <option value="external_review">External Review</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Who approves incident resolution and policy updates</p>
                </label>

                <label className="text-xs text-slate-300">Safeguarding Lead
                  <input
                    ref={(element) => { createFieldRefs.current.createSafeguardingLead = element; }}
                    value={createSafeguardingLead}
                    onChange={(event) => setCreateSafeguardingLead(event.target.value)}
                    placeholder="Name or email of safeguarding lead"
                    className={wizardFieldClass("createSafeguardingLead")}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Critical for incident response and student welfare</p>
                </label>

                <label className="text-xs text-slate-300">Data Subject Lead (DSL)
                  <input
                    ref={(element) => { createFieldRefs.current.createDslContact = element; }}
                    value={createDslContact}
                    onChange={(event) => setCreateDslContact(event.target.value)}
                    placeholder="Name or email of DSL contact"
                    className={wizardFieldClass("createDslContact")}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">GDPR compliance and data access requests</p>
                </label>

                <label className="text-xs text-slate-300">Data Retention Policy
                  <select ref={(element) => { createFieldRefs.current.createDataRetention = element; }} value={createDataRetention} onChange={(event) => setCreateDataRetention(event.target.value)} className={wizardFieldClass("createDataRetention")}>
                    <option value="">Select retention policy</option>
                    <option value="standard">Standard (3-year retention)</option>
                    <option value="extended">Extended (6-year retention)</option>
                    <option value="minimal">Minimal (1-year retention)</option>
                    <option value="custom">Custom (specify in brief)</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Archives and deletion schedules for operational data</p>
                </label>

                <div className="md:col-span-2 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateWizardStep(1)}
                    className={subtleButtonClass}
                  >
                    Back to Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateWizardStep(3)}
                    disabled={!canAdvanceToStep3}
                    className={`${primaryButtonClass} min-w-56`}
                  >
                    Continue to Review
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="md:col-span-2 rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Step 03 · Review & Confirm</p>
                  <p className="mt-1 text-xs text-indigo-100/90">Validate all onboarding inputs before creating the workspace.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${canAdvanceToStep2 ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-rose-500/40 bg-rose-500/15 text-rose-100"}`}>Profile {canAdvanceToStep2 ? "Ready" : "Needs fixes"}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${canAdvanceToStep3 ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-rose-500/40 bg-rose-500/15 text-rose-100"}`}>Launch {canAdvanceToStep3 ? "Ready" : "Needs fixes"}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-200">
                  <p className="font-semibold text-slate-100">School Profile</p>
                  <p className="mt-1">Name: {createName || "-"}</p>
                  <p>Type: {createType}</p>
                  <p>Licence: {createStatus} ({createLicenceTier})</p>
                  <p>Contact: {createEmail || "-"} {createPhone ? `| ${createPhone}` : ""}</p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-200">
                  <p className="font-semibold text-slate-100">Launch Readiness & Governance</p>
                  <p className="mt-1">Priority: {createPriority}</p>
                  <p>Region: {createRegion}</p>
                  <p data-testid="gov2-review-region-compliance">Region Compliance: {regionComplianceProfileLabel}</p>
                  <p data-testid="gov2-review-communication-pref">Communication Preferences: {communicationPreferenceLabel}</p>
                  <p data-testid="gov2-review-parent-mode">Parent Onboarding Mode: {parentOnboardingModeLabel}</p>
                  <p data-testid="gov3-review-retention-strategy">Retention Strategy: {retentionStrategyLabel}</p>
                  <p data-testid="gov3-review-escalation-chain">Escalation Chain: {escalationChainLabel}</p>
                  <p data-testid="gov3-review-safeguarding-workflow">Safeguarding Workflow: {safeguardingWorkflowLabel}</p>
                  <p data-testid="gov3-review-approval-workflow">Approval Workflow: {approvalWorkflowLabel}</p>
                  <p>Target Launch: {createLaunchTarget || "-"}</p>
                  <p>Safeguarding Lead: {createSafeguardingLead || "-"}</p>
                  <p>DSL Contact: {createDslContact || "-"}</p>
                  <p>Data Retention: {createDataRetention || "-"}</p>
                  <p className="line-clamp-3">Ops Brief: {createOnboardingBrief || "-"}</p>
                </div>

                <div className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-200">
                  <p className="font-semibold text-slate-100">Readiness Rollup</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                      <p className="text-[11px] font-semibold text-slate-300">Recommendations</p>
                      <p className="mt-1 text-[11px] text-slate-200">Total: {smartRecommendations.length}</p>
                      <p className="text-[11px] text-rose-200">Critical: {smartRecommendations.filter((rec) => rec.priority === "critical").length}</p>
                      <p className="text-[11px] text-amber-200">High: {smartRecommendations.filter((rec) => rec.priority === "high").length}</p>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                      <p className="text-[11px] font-semibold text-slate-300">Audit Activity</p>
                      <p className="mt-1 text-[11px] text-slate-200">Entries logged: {auditTrail.length}</p>
                      <p className="text-[11px] text-slate-200">Last action: {auditTrail[0] ? `${auditTrail[0].action} (${timeAgo(auditTrail[0].timestamp)})` : "No activity yet"}</p>
                      <button
                        type="button"
                        onClick={() => setShowAuditTrail(true)}
                        className="mt-2 rounded border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-800"
                      >
                        Open Audit Panel
                      </button>
                    </div>
                  </div>
                </div>

                <label className="md:col-span-2 flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={createConfirmChecked}
                    onChange={(event) => setCreateConfirmChecked(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I confirm this onboarding pack is complete and ready for governance activation.</span>
                </label>

                <div className="md:col-span-2 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateWizardStep(2)}
                    className={subtleButtonClass}
                  >
                    Back to Launch Readiness
                  </button>
                  <button disabled={saving || !canSubmitWizard} className={`${primaryButtonClass} min-w-56`}>Create School Workspace</button>
                </div>
              </>
            )}
                </div>
              </>
            )}
          </form>
        </div>
      </AdminSectionCard>

      {schools.length === 0 && !loading ? (
        <section className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/35 p-6">
          <h2 className="text-lg font-bold text-white">No schools created yet</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Start with one organisation above. After setup, you will unlock classroom setup, teacher invite flows, compliance exports,
            communication oversight, and safeguarding governance controls.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className={panelClass}><p className="text-xs text-slate-400">Step 1</p><p className="mt-1 text-sm font-semibold text-white">Create organisation profile</p></div>
            <div className={panelClass}><p className="text-xs text-slate-400">Step 2</p><p className="mt-1 text-sm font-semibold text-white">Configure licence and seats</p></div>
            <div className={panelClass}><p className="text-xs text-slate-400">Step 3</p><p className="mt-1 text-sm font-semibold text-white">Invite staff and enrol students</p></div>
          </div>
        </section>
      ) : null}

      {schools.length > 0 ? (
        <AdminSectionCard title="Schools Table" eyebrow="Operations">
          <div className="overflow-x-auto">
            <table className="w-full min-w-240 text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">School Name</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Seats</th>
                  <th className="px-3 py-3">Teachers</th>
                  <th className="px-3 py-3">Students</th>
                  <th className="px-3 py-3">Classrooms</th>
                  <th className="px-3 py-3">Safeguarding</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.map((school) => {
                  const risk = schoolRiskState(school);
                  const riskClass = risk.licenceExpired || risk.seatFull || school.safeguarding.criticalAlerts > 0
                    ? "bg-rose-500/10"
                    : selectedSchoolId === school.id
                      ? "bg-indigo-500/10"
                      : "hover:bg-slate-900/40";

                  return (
                    <tr key={school.id} className={`border-b border-slate-800/70 ${riskClass}`}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-white">{school.name}</p>
                      <p className="text-xs text-slate-400">{typeLabel(school.type)} · {school.slug}</p>
                      {risk.hasInactiveClassrooms ? <p className="mt-1 text-[11px] font-semibold text-amber-200">Inactive classrooms detected</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClass(school.status)}`}>
                        {schoolStatusLabel(school.status)}
                      </span>
                      {risk.licenceExpired ? <p className="mt-1 text-[11px] font-semibold text-rose-200">Expired licence</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      {school.licence ? `${school.licence.seatsUsed}/${school.licence.seatLimit || "∞"}` : "-"}
                      {risk.seatFull ? <p className="mt-1 text-[11px] font-semibold text-rose-200">Over capacity</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      {risk.activeTeachers}
                      {risk.activeTeachers === 0 ? <p className="mt-1 text-[11px] font-semibold text-amber-200">No active teachers</p> : null}
                    </td>
                    <td className="px-3 py-3">{school.students.filter((row) => row.status === "active").length}</td>
                    <td className="px-3 py-3">{school.classrooms.length}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${school.safeguarding.openAlerts > 0 ? "border-rose-500/40 bg-rose-500/15 text-rose-200" : "border-slate-500/30 bg-slate-500/10 text-slate-300"}`}>
                        {school.safeguarding.openAlerts} open
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => { applySchoolSelection(school); jumpToSection("dashboard"); }} className={subtleButtonClass}>Open Dashboard</button>
                        <button onClick={() => { applySchoolSelection(school); jumpToSection("teachers"); }} className={subtleButtonClass}>Manage Teachers</button>
                        <button onClick={() => { applySchoolSelection(school); jumpToSection("safeguarding"); }} className={subtleButtonClass}>View Safeguarding</button>
                        <button onClick={() => { applySchoolSelection(school); jumpToSection("communication"); }} className={subtleButtonClass}>Send Communication</button>
                        <button onClick={() => void onExportSchoolData(school.id, school.name)} className={subtleButtonClass}>Export Data</button>
                        <button onClick={() => void onSuspendSchool(school)} className="rounded-lg border border-rose-600/60 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/15">Suspend School</button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filteredSchools.length ? (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              No schools match these operational filters. Impact: high-risk items may be hidden from view.
              Next action: clear one or more filters to restore full monitoring coverage.
            </div>
          ) : null}
        </AdminSectionCard>
      ) : null}

      {selectedSchool ? (
        <>
          <div id="school-dashboard">
            <AdminSectionCard title={`${selectedSchool.name} Overview`} eyebrow="Selected School">
            <div className="grid gap-4 md:grid-cols-5">
              <div className={panelClass}><p className="text-xs text-slate-400">Licence Status</p><p className="mt-1 text-xl font-black text-white">{licenceStatusLabel(selectedSchool.licence?.status ?? "pilot")}</p></div>
              <div className={panelClass}><p className="text-xs text-slate-400">Seats</p><p className="mt-1 text-xl font-black text-white">{selectedSchool.licence?.seatsUsed ?? 0}/{selectedSchool.licence?.seatLimit || "∞"}</p></div>
              <div className={panelClass}><p className="text-xs text-slate-400">Teachers</p><p className="mt-1 text-xl font-black text-white">{selectedSchool.teachers.filter((row) => row.status === "active").length}</p></div>
              <div className={panelClass}><p className="text-xs text-slate-400">Students</p><p className="mt-1 text-xl font-black text-white">{selectedSchool.students.filter((row) => row.status === "active").length}</p></div>
              <div className={panelClass}><p className="text-xs text-slate-400">Safeguarding</p><p className="mt-1 text-xl font-black text-rose-200">{selectedSchool.safeguarding.openAlerts}</p></div>
            </div>
            </AdminSectionCard>
          </div>

          <AdminSectionCard title="Launch Readiness Scoring" eyebrow="Dynamic Assessment">
            <DynamicScoringDashboard school={selectedSchool} />
          </AdminSectionCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <AdminSectionCard title="School Profile" eyebrow="Basic Info">
              <form onSubmit={(event) => void onSaveSchoolProfile(event)} className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-300">School Name
                  <input required value={editSchoolName} onChange={(event) => setEditSchoolName(event.target.value)} className={fieldClass} />
                </label>
                <label className="text-xs text-slate-300">Organisation Type
                  <select value={editSchoolType} onChange={(event) => setEditSchoolType(event.target.value)} className={fieldClass}>
                    <option value="school">School</option>
                    <option value="tutoring_centre">Tutoring Centre</option>
                    <option value="organisation">Organisation</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Licence Status
                  <select value={editSchoolStatus} onChange={(event) => setEditSchoolStatus(event.target.value)} className={fieldClass}>
                    <option value="pilot">Pilot</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Contact Email
                  <input value={editSchoolEmail} onChange={(event) => setEditSchoolEmail(event.target.value)} className={fieldClass} />
                </label>
                <label className="text-xs text-slate-300">Contact Phone
                  <input value={editSchoolPhone} onChange={(event) => setEditSchoolPhone(event.target.value)} className={fieldClass} />
                </label>
                <label className="text-xs text-slate-300 md:col-span-2">Notes
                  <textarea value={editSchoolNotes} onChange={(event) => setEditSchoolNotes(event.target.value)} rows={3} className={fieldClass} />
                </label>
                <div className="md:col-span-2"><button disabled={saving} className={primaryButtonClass}>Save School Profile</button></div>
              </form>
            </AdminSectionCard>

            <div id="school-licence">
              <AdminSectionCard title="Licence Management" eyebrow="Billing">
                <form onSubmit={(event) => void onSaveLicence(event)} className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-300">Licence Status
                  <select value={licenceStatus} onChange={(event) => setLicenceStatus(event.target.value)} className={fieldClass}>
                    <option value="pilot">Pilot</option>
                    <option value="active">Active</option>
                    <option value="trialing">Trialing</option>
                    <option value="past_due">Past Due</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Seat Limit
                  <input type="number" min={0} value={licenceSeatLimit} onChange={(event) => setLicenceSeatLimit(event.target.value)} className={fieldClass} />
                </label>
                <label className="text-xs text-slate-300">Provider
                  <input value={licenceProvider} onChange={(event) => setLicenceProvider(event.target.value)} className={fieldClass} />
                </label>
                <label className="text-xs text-slate-300">Billing Interval
                  <select value={licenceInterval} onChange={(event) => setLicenceInterval(event.target.value)} className={fieldClass}>
                    <option value="custom">Custom</option>
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                  </select>
                </label>
                <label className="text-xs text-slate-300">Trial Ends
                  <input type="date" value={licenceTrialEndsAt} onChange={(event) => setLicenceTrialEndsAt(event.target.value)} className={fieldClass} />
                </label>
                <label className="text-xs text-slate-300">Current Period Ends
                  <input type="date" value={licenceCurrentPeriodEnd} onChange={(event) => setLicenceCurrentPeriodEnd(event.target.value)} className={fieldClass} />
                </label>
                <div className="md:col-span-2"><button disabled={saving} className={primaryButtonClass}>Save Licence Settings</button></div>
                </form>
              </AdminSectionCard>
            </div>
          </div>

          <AdminSectionCard
            title="Operational Ownership"
            eyebrow="Reviewer · Safeguarding Lead · Compliance Officer"
            action={(
              <button
                type="button"
                onClick={() => setShowOperationalOwnership(!showOperationalOwnership)}
                className="text-[10px] text-slate-400 hover:text-slate-200 transition"
              >
                {showOperationalOwnership ? "Collapse" : "Expand"}
              </button>
            )}
          >
            {showOperationalOwnership && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="text-xs text-slate-300">Assigned Reviewer
                    <input
                      value={ownershipBySchool[selectedSchool.id]?.reviewer ?? ""}
                      onChange={(event) => updateOwnershipField(selectedSchool.id, "reviewer", event.target.value)}
                      placeholder="Name or email"
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs text-slate-300">Safeguarding Lead
                    <input
                      value={ownershipBySchool[selectedSchool.id]?.safeguardingLead ?? ""}
                      onChange={(event) => updateOwnershipField(selectedSchool.id, "safeguardingLead", event.target.value)}
                      placeholder="Name or email"
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs text-slate-300">Compliance Officer
                    <input
                      value={ownershipBySchool[selectedSchool.id]?.complianceOfficer ?? ""}
                      onChange={(event) => updateOwnershipField(selectedSchool.id, "complianceOfficer", event.target.value)}
                      placeholder="Name or email"
                      className={fieldClass}
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs text-slate-400">Ownership assignments are currently local to this operations workstation and enable workflow accountability tracking.</p>
              </>
            )}
          </AdminSectionCard>

          <AdminSectionCard
            title="SLA & Workflow Ageing"
            eyebrow="Escalation Timers"
            action={(
              <button
                type="button"
                onClick={() => setShowSLAAgeing(!showSLAAgeing)}
                className="text-[10px] text-slate-400 hover:text-slate-200 transition"
              >
                {showSLAAgeing ? "Collapse" : "Expand"}
              </button>
            )}
          >
            {showSLAAgeing && (
              <div className="grid gap-3 md:grid-cols-2">
              {selectedSchool.safeguardingIncidents
                .filter((incident) => incident.status !== "resolved" && isOlderThan(incident.createdAt, 1))
                .map((incident) => (
                  <article key={incident.id} className="rounded-xl border border-rose-500/40 bg-rose-500/15 p-3">
                    <p className="text-sm font-semibold text-white">Safeguarding unresolved &gt; 24h</p>
                    <p className="mt-1 text-xs text-rose-100">{incident.category} · {incident.studentName ?? "Unassigned student"}</p>
                  </article>
                ))}
              {selectedSchool.teachers
                .filter((teacher) => teacher.status === "invited" && isOlderThan(teacher.invitedAt, 7))
                .map((teacher) => (
                  <article key={teacher.id} className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-3">
                    <p className="text-sm font-semibold text-white">Invite pending &gt; 7d</p>
                    <p className="mt-1 text-xs text-amber-100">{teacher.name ?? teacher.email}</p>
                  </article>
                ))}
              {selectedSchool.activityTimeline
                .filter((item) => item.action === "compliance_delete_requested" && isOlderThan(item.createdAt, 14))
                .map((item) => (
                  <article key={item.id} className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-3">
                    <p className="text-sm font-semibold text-white">Compliance delete pending &gt; 14d</p>
                    <p className="mt-1 text-xs text-amber-100">Entity {item.entityId ?? "unknown"}</p>
                  </article>
                ))}
              {schoolRiskState(selectedSchool).licenceExpired ? (
                <article className="rounded-xl border border-rose-500/40 bg-rose-500/15 p-3">
                  <p className="text-sm font-semibold text-white">Expired licence unresolved</p>
                  <p className="mt-1 text-xs text-rose-100">Update licence status or renew period immediately.</p>
                </article>
              ) : null}
              {selectedSchool.safeguardingIncidents.filter((incident) => incident.status !== "resolved" && isOlderThan(incident.createdAt, 1)).length === 0
                && selectedSchool.teachers.filter((teacher) => teacher.status === "invited" && isOlderThan(teacher.invitedAt, 7)).length === 0
                && selectedSchool.activityTimeline.filter((item) => item.action === "compliance_delete_requested" && isOlderThan(item.createdAt, 14)).length === 0
                && !schoolRiskState(selectedSchool).licenceExpired ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100 md:col-span-2">
                    No SLA breaches detected. Continue running morning saved views to maintain proactive operations.
                  </div>
                ) : null}
              </div>
            )}
          </AdminSectionCard>

          <div id="school-teachers">
            <AdminSectionCard title="School Operations" eyebrow="Invites · Classrooms · Enrolments">
            <div className="grid gap-6 xl:grid-cols-3">
              <section className={panelClass}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Classrooms</h3>
                  <button
                    type="button"
                    onClick={() => setShowClassrooms(!showClassrooms)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showClassrooms ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showClassrooms && (
                  <>
                    <form onSubmit={(event) => void onCreateClassroom(event)} className="mt-3 grid gap-2">
                      <input required value={classroomName} onChange={(event) => setClassroomName(event.target.value)} placeholder="Classroom name" className={fieldClass} />
                      <input value={classroomYearGroup} onChange={(event) => setClassroomYearGroup(event.target.value)} placeholder="Year group" className={fieldClass} />
                      <input value={classroomAcademicYear} onChange={(event) => setClassroomAcademicYear(event.target.value)} placeholder="Academic year" className={fieldClass} />
                      <select value={classroomTeacherId} onChange={(event) => setClassroomTeacherId(event.target.value)} className={fieldClass}>
                        <option value="">No teacher assigned</option>
                        {selectedSchool.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name ?? teacher.email}</option>)}
                      </select>
                      <button disabled={saving} className={primaryButtonClass}>Create Classroom</button>
                    </form>
                    <div className="mt-3 space-y-2">
                      {selectedSchool.classrooms.map((classroom) => (
                        <article key={classroom.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                          <p className="text-sm font-semibold text-white">{classroom.name}</p>
                          <p className="text-xs text-slate-400">{classroom.yearGroup || "No year"} · {classroom.studentsCount} students</p>
                        </article>
                      ))}
                      {!selectedSchool.classrooms.length ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                          No classrooms yet. Impact: enrolments cannot be grouped for staffing coverage.
                          Next action: create your first classroom and assign a lead teacher.
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </section>

              <section className={`${panelClass} ${focusedOpsSection === "teachers" ? "ring-1 ring-indigo-400/60" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Invites</h3>
                  <button
                    type="button"
                    onClick={() => setShowInvites(!showInvites)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showInvites ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showInvites && (
                  <>
                    <form onSubmit={(event) => void onInviteTeacher(event)} className="mt-3 grid gap-2">
                      <input required type="email" value={teacherEmail} onChange={(event) => setTeacherEmail(event.target.value)} placeholder="Teacher email" className={fieldClass} />
                      <input value={teacherName} onChange={(event) => setTeacherName(event.target.value)} placeholder="Display name" className={fieldClass} />
                      <select value={teacherRole} onChange={(event) => setTeacherRole(event.target.value)} className={fieldClass}>
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                        <option value="support">Support</option>
                        <option value="staff_observer">Staff Observer</option>
                        <option value="finance">Finance</option>
                        <option value="owner">Owner</option>
                      </select>
                      <input value={teacherTitle} onChange={(event) => setTeacherTitle(event.target.value)} placeholder="Title" className={fieldClass} />
                      <button disabled={saving} className={primaryButtonClass}>Send Invite</button>
                    </form>
                    <div className="mt-3 space-y-2">
                      {selectedSchool.teachers.map((teacher) => (
                        <article key={teacher.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-white">{teacher.name ?? teacher.email}</p>
                              <p className="text-xs text-slate-400">{teacher.role} · {teacher.email}</p>
                            </div>
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(teacher.status)}`}>{teacher.status}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {teacher.status === "invited" ? (
                              <>
                                <button disabled={saving} onClick={() => void postAction("resendInvite", { teacherId: teacher.id })} className={subtleButtonClass}>Resend</button>
                                <button disabled={saving} onClick={() => void postAction("revokeInvite", { teacherId: teacher.id })} className={subtleButtonClass}>Revoke</button>
                              </>
                            ) : null}
                            <button disabled={saving} onClick={() => void postAction("updateTeacher", { teacherId: teacher.id, status: teacher.status === "active" ? "suspended" : "active" })} className={subtleButtonClass}>
                              {teacher.status === "active" ? "Suspend" : "Activate"}
                            </button>
                          </div>
                        </article>
                      ))}
                      {!selectedSchool.teachers.length ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                          No teachers invited yet. Impact: no operational owner is assigned for classes.
                          Next action: invite at least one teacher or admin.
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </section>

              <section className={panelClass}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Enrolments</h3>
                  <button
                    type="button"
                    onClick={() => setShowEnrolments(!showEnrolments)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showEnrolments ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showEnrolments && (
                  <>
                    <form onSubmit={(event) => void onAssignStudent(event)} className="mt-3 grid gap-2">
                      <select required value={assignChildId} onChange={(event) => setAssignChildId(event.target.value)} className={fieldClass}>
                        <option value="">Select student</option>
                        {students.map((student) => <option key={student.id} value={student.id}>{student.name} ({student.parentEmail})</option>)}
                      </select>
                      <select value={assignClassroomId} onChange={(event) => setAssignClassroomId(event.target.value)} className={fieldClass}>
                        <option value="">No classroom</option>
                        {selectedSchool.classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
                      </select>
                      <input value={assignExternalRef} onChange={(event) => setAssignExternalRef(event.target.value)} placeholder="External reference" className={fieldClass} />
                      <button disabled={saving} className={primaryButtonClass}>Assign Student</button>
                    </form>
                    <p className="mt-3 text-xs text-slate-400">
                      Trial ends: {shortDate(selectedSchool.licence?.trialEndsAt ?? null)} · Period ends: {shortDate(selectedSchool.licence?.currentPeriodEnd ?? null)}
                    </p>
                  </>
                )}
              </section>
            </div>
            </AdminSectionCard>
          </div>

          <AdminSectionCard
            title="Intervention Queue"
            eyebrow="Operational Risks"
            action={(
              <button
                type="button"
                onClick={() => setShowInterventionQueue(!showInterventionQueue)}
                className="text-[10px] text-slate-400 hover:text-slate-200 transition"
              >
                {showInterventionQueue ? "Collapse" : "Expand"}
              </button>
            )}
          >
            {showInterventionQueue && (
              <div className="grid gap-3 md:grid-cols-2">
              {selectedSchool.students.filter((student) => !student.classroomName).map((student) => (
                <article key={student.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-sm font-semibold text-white">{student.childName}</p>
                  <p className="text-xs text-amber-100">No classroom assigned. Assign placement to activate teacher oversight.</p>
                </article>
              ))}
              {selectedSchool.teachers.filter((teacher) => teacher.status === "invited").map((teacher) => (
                <article key={teacher.id} className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                  <p className="text-sm font-semibold text-white">{teacher.name ?? teacher.email}</p>
                  <p className="text-xs text-sky-100">Invite pending. Resend or revoke to keep staffing records current.</p>
                </article>
              ))}
              {selectedSchool.safeguardingIncidents.filter((incident) => incident.status !== "resolved").slice(0, 6).map((incident) => (
                <article key={incident.id} className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                  <p className="text-sm font-semibold text-white">{incident.category} · {incident.severity}</p>
                  <p className="text-xs text-rose-100">Status: {incident.status}. Escalation: {incident.escalationLevel ?? "not set"}.</p>
                </article>
              ))}
              {!selectedSchool.students.some((student) => !student.classroomName)
                && !selectedSchool.teachers.some((teacher) => teacher.status === "invited")
                && !selectedSchool.safeguardingIncidents.some((incident) => incident.status !== "resolved") ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100 md:col-span-2">
                    No intervention items right now. Impact: operations are stable.
                    Next action: continue monitoring filters for emerging risk.
                  </div>
                ) : null}
              </div>
            )}
          </AdminSectionCard>

          <div id="school-safeguarding">
            <AdminSectionCard title="Governance Area" eyebrow="Invites · Compliance · Audit · Safeguarding · Exports">
            <div className="grid gap-4 lg:grid-cols-2">
              <section id="school-exports" className={`${panelClass} ${focusedOpsSection === "exports" ? "ring-1 ring-indigo-400/60" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Compliance & Exports</h3>
                  <button
                    type="button"
                    onClick={() => setShowCompliance(!showCompliance)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showCompliance ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showCompliance && (
                  <div className="mt-3 space-y-2">
                  {selectedSchool.students.map((student) => (
                    <article key={student.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{student.childName}</p>
                          <p className="text-xs text-slate-400">{student.classroomName ?? "No classroom"} · {student.status}</p>
                        </div>
                        <div className="flex gap-2">
                          <button disabled={saving} onClick={() => void onExportStudent(student.id, student.childName)} className={subtleButtonClass}>Export</button>
                          <button disabled={saving || student.status === "archived"} onClick={() => void onDeleteRequest(student.id, student.childName)} className={subtleButtonClass}>Delete Request</button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!selectedSchool.students.length ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                      No students assigned yet. Impact: export and compliance actions are unavailable.
                      Next action: enrol students before running compliance workflows.
                    </div>
                  ) : null}
                  </div>
                )}
              </section>

              <section id="school-communication" className={`${panelClass} ${focusedOpsSection === "communication" ? "ring-1 ring-indigo-400/60" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Communication Audit</h3>
                  <button
                    type="button"
                    onClick={() => setShowCommunicationAudit(!showCommunicationAudit)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showCommunicationAudit ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showCommunicationAudit && (
                  <div className="mt-3 space-y-2">
                  {selectedSchool.communicationLogs.map((entry) => (
                    <article key={entry.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{entry.subject}</p>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(entry.deliveryStatus)}`}>{entry.deliveryStatus}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{entry.parentEmail} · {entry.studentName}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-300">{entry.messageBody}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{shortDateTime(entry.createdAt)} · {entry.actorName ?? "system"}</p>
                    </article>
                  ))}
                  {!selectedSchool.communicationLogs.length ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                      No communication history yet. Impact: outreach cannot be audited.
                      Next action: send first communication and review delivery status.
                    </div>
                  ) : null}
                  </div>
                )}
              </section>

              <section className={`${panelClass} ${focusedOpsSection === "safeguarding" ? "ring-1 ring-rose-400/60" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Safeguarding</h3>
                  <button
                    type="button"
                    onClick={() => setShowSafeguardingDetails(!showSafeguardingDetails)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showSafeguardingDetails ? "Collapse" : "Expand"}
                  </button>
                </div>
                <p className="text-sm text-slate-300">
                  Open alerts: <span className="font-bold text-rose-200">{selectedSchool.safeguarding.openAlerts}</span>
                  {" · "}
                  Critical: <span className="font-bold text-rose-300">{selectedSchool.safeguarding.criticalAlerts}</span>
                </p>
                {showSafeguardingDetails && (
                  <>
                    <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100">
                      Keep incident records, evidence uploads, and escalation ownership reviewed here before parent communications are sent.
                    </div>
                    <div className="mt-3 space-y-2">
                  {selectedSchool.safeguardingIncidents.map((incident) => (
                    <article key={incident.id} className={`rounded-lg border p-2 ${incident.severity === "critical" ? "border-rose-500/50 bg-rose-500/15" : "border-slate-700 bg-slate-950/60"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{incident.category} · {incident.status}</p>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(incident.severity)}`}>{incident.severity}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        Student: {incident.studentName ?? "Unassigned"} · Reported by: {incident.reportedBy ?? "system"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">Updated: {shortDateTime(incident.updatedAt)}</p>
                    </article>
                  ))}
                  {!selectedSchool.safeguardingIncidents.length ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-100">
                      No safeguarding incidents recorded. Impact: clear monitoring baseline.
                      Next action: keep safeguarding checks active and review alerts daily.
                    </div>
                      ) : null}
                    </div>
                  </>
                )}
              </section>

              <section className={panelClass}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Parent Preferences</h3>
                  <button
                    type="button"
                    onClick={() => setShowParentPreferences(!showParentPreferences)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showParentPreferences ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showParentPreferences && (
                  <div className="mt-3 space-y-2">
                    {selectedSchool.communicationPreferences.map((entry) => (
                      <article key={entry.linkId} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                        <p className="text-sm font-semibold text-white">{entry.studentName}</p>
                        <p className="text-xs text-slate-400">{entry.parentName ?? entry.parentEmail}</p>
                        <p className="mt-1 text-[11px] text-slate-300">Opt-out: {shortDateTime(entry.optedOutAt)} · Lock: {shortDateTime(entry.safeguardingLockedAt)}</p>
                      </article>
                    ))}
                    {!selectedSchool.communicationPreferences.length ? <p className="text-xs text-slate-400">No preference records yet.</p> : null}
                  </div>
                )}
              </section>

              <section id="school-timeline" className={panelClass + " lg:col-span-2"}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Activity Timeline</h3>
                  <button
                    type="button"
                    onClick={() => setShowActivityTimeline(!showActivityTimeline)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showActivityTimeline ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showActivityTimeline && (
                  <div className="mt-3 space-y-2">
                    {selectedSchool.activityTimeline.map((item) => (
                      <article key={item.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">{item.action}</p>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(item.severity)}`}>{item.severity}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{item.entityType} · {item.entityId ?? "-"}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{shortDateTime(item.createdAt)}</p>
                      </article>
                    ))}
                    {!selectedSchool.activityTimeline.length ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                        No timeline activity yet. Impact: operational changes are not visible in chronological view.
                        Next action: perform an invite, licence update, export, or compliance action to seed audit history.
                      </div>
                    ) : null}
                  </div>
                )}
              </section>

              <section className={panelClass + " lg:col-span-2"} data-testid="prov-hardening-panel">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-white">Provisioning Hardening</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="prov-runner-button"
                      onClick={() => void onRunProvisioningRunner()}
                      disabled={provisioningRunnerBusy || !backendProvisioningEnabled}
                      className={subtleButtonClass}
                    >
                      {provisioningRunnerBusy ? "Running..." : "Run Admin Runner"}
                    </button>
                    <button
                      type="button"
                      data-testid="prov-history-refresh"
                      onClick={() => void loadProvisioningHistory()}
                      disabled={provisioningHistoryLoading || !selectedSchoolId}
                      className={subtleButtonClass}
                    >
                      Refresh History
                    </button>
                    <button
                      type="button"
                      data-testid="prov-history-toggle"
                      onClick={() => setProvisioningExpanded((prev) => !prev)}
                      className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                    >
                      {provisioningExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Backend provisioning remains feature-safe. Mock provisioning stays active unless backend feature flag is enabled.
                </p>
                {latestProvisioningFailure ? (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100" data-testid="prov-failure-summary">
                    Last failure: {latestProvisioningFailure.job.id.slice(0, 8)} · step {latestProvisioningFailure.step?.stepKey ?? "unknown"}.
                    {" "}Retry is available below.
                  </div>
                ) : null}
                {provisioningExpanded ? (
                  <div className="mt-3 space-y-2 max-h-72 overflow-y-auto" data-testid="prov-history-list">
                    {provisioningHistoryLoading ? <p className="text-xs text-slate-400">Loading provisioning history...</p> : null}
                    {!provisioningHistoryLoading && provisioningHistory.length === 0 ? (
                      <p className="text-xs text-slate-400">No provisioning jobs yet for this school.</p>
                    ) : null}
                    {provisioningHistory.map((job) => {
                      const durationMs = (() => {
                        if (job.startedAt && job.finishedAt) {
                          return Math.max(0, new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime());
                        }
                        return job.stepRuns.reduce((sum, step) => sum + (step.durationMs ?? 0), 0);
                      })();
                      const failedSteps = job.stepRuns.filter((step) => step.status === "failed");
                      return (
                        <article key={job.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2" data-testid="prov-job-row">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-white">Job {job.id.slice(0, 8)}</p>
                              <p className="text-[11px] text-slate-400">Attempts {job.attemptCount}/{job.maxAttempts} · {Math.round(durationMs / 1000)}s</p>
                            </div>
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(job.status)}`} data-testid="prov-status-badge">{job.status}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {job.status === "failed" || job.status === "retry_scheduled" ? (
                              <button
                                type="button"
                                data-testid="prov-retry-button"
                                onClick={() => void onProvisioningJobAction(job.id, "retry")}
                                disabled={saving}
                                className={subtleButtonClass}
                              >
                                Retry Failed Job
                              </button>
                            ) : null}
                            {job.status === "queued" || job.status === "running" || job.status === "retry_scheduled" ? (
                              <button
                                type="button"
                                data-testid="prov-cancel-button"
                                onClick={() => void onProvisioningJobAction(job.id, "cancel")}
                                disabled={saving}
                                className={subtleButtonClass}
                              >
                                Cancel Job
                              </button>
                            ) : null}
                          </div>
                          {failedSteps.length > 0 ? (
                            <p className="mt-2 text-[11px] text-rose-200">
                              Failed steps: {failedSteps.map((step) => step.stepKey).join(", ")}
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section className={panelClass + " lg:col-span-2"} data-testid="mat-trust-panel">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">MAT / Multi-School Operations</h3>
                  <button
                    type="button"
                    data-testid="mat-toggle"
                    onClick={() => setShowMatPanel((prev) => !prev)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showMatPanel ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showMatPanel ? (
                  <div className="grid gap-3 lg:grid-cols-2" data-testid="mat-panel-body">
                    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-3" data-testid="trust-management-form">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Trust Management</p>
                      <div className="mt-2 grid gap-2">
                        <input value={trustName} onChange={(event) => setTrustName(event.target.value)} placeholder="Trust name" className={fieldClass} data-testid="trust-name-input" />
                        <input value={trustCode} onChange={(event) => setTrustCode(event.target.value)} placeholder="Trust code" className={fieldClass} data-testid="trust-code-input" />
                        <input value={trustRegion} onChange={(event) => setTrustRegion(event.target.value)} placeholder="Region" className={fieldClass} data-testid="trust-region-input" />
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void onCreateOrUpdateTrust()} disabled={saving || !trustName.trim() || !trustCode.trim()} className={primaryButtonClass} data-testid="trust-save-button">Save Trust</button>
                          <button type="button" onClick={() => void onAttachSelectedSchoolToTrust()} disabled={saving || !selectedTrustId || !selectedSchoolId} className={subtleButtonClass} data-testid="trust-assign-school-button">Assign Selected School</button>
                        </div>
                        <input value={trustSearch} onChange={(event) => setTrustSearch(event.target.value)} placeholder="Search trust / region" className={fieldClass} data-testid="trust-search-input" />
                      </div>
                    </article>

                    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-3" data-testid="trust-overview-card">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Regional Overview</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {regionalTrustOverview.slice(0, 4).map((region) => (
                          <div key={region.region} className="rounded border border-slate-700 bg-slate-900/60 p-2 text-xs text-slate-200" data-testid="trust-region-card">
                            <p className="font-semibold text-white">{region.region}</p>
                            <p>Trusts: {region.trusts}</p>
                            <p>Schools: {region.schools}</p>
                          </div>
                        ))}
                        {!regionalTrustOverview.length ? <p className="text-xs text-slate-400">No trust regions yet.</p> : null}
                      </div>
                      <div className="mt-3 space-y-2 max-h-36 overflow-y-auto" data-testid="trust-list">
                        {trustsLoading ? <p className="text-xs text-slate-400">Loading trusts...</p> : null}
                        {filteredTrusts.map((trust) => (
                          <button
                            key={trust.id}
                            type="button"
                            onClick={() => setSelectedTrustId(trust.id)}
                            className={`w-full rounded border p-2 text-left text-xs transition ${selectedTrustId === trust.id ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-100" : "border-slate-700 bg-slate-900/50 text-slate-200"}`}
                            data-testid="trust-row"
                          >
                            <p className="font-semibold">{trust.name} ({trust.code})</p>
                            <p>{trust.headquartersRegion ?? "Unassigned"} · Schools {(trust._count?.schoolMemberships ?? 0)}</p>
                          </button>
                        ))}
                        {!trustsLoading && filteredTrusts.length === 0 ? <p className="text-xs text-slate-400">No trusts match search.</p> : null}
                      </div>
                    </article>

                    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 lg:col-span-2" data-testid="bulk-onboarding-panel">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Bulk Onboarding</p>
                      <p className="mt-1 text-[11px] text-slate-400">One school name per line. Slugs are generated automatically for additive onboarding batches.</p>
                      <textarea value={bulkRowsInput} onChange={(event) => setBulkRowsInput(event.target.value)} rows={4} className={fieldClass} data-testid="bulk-rows-input" />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                          <input type="checkbox" checked={bulkDryRun} onChange={(event) => setBulkDryRun(event.target.checked)} />
                          Dry run
                        </label>
                        <button type="button" onClick={() => void onCreateBulkBatch()} disabled={bulkLoading} className={primaryButtonClass} data-testid="bulk-create-button">Create Batch</button>
                      </div>
                      <div className="mt-3 space-y-2" data-testid="bulk-batch-list">
                        {bulkBatches.slice(0, 5).map((batch) => (
                          <article key={batch.id} className="rounded border border-slate-700 bg-slate-900/60 p-2 text-xs text-slate-200" data-testid="bulk-batch-row">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold">Batch {batch.id.slice(0, 8)} · {batch.sourceType}</p>
                              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(batch.status)}`}>{batch.status}</span>
                            </div>
                            <p className="mt-1">Rows {batch.totalRows} · Success {batch.successRows} · Failed {batch.failedRows}</p>
                            {batch.status === "ready" || batch.status === "failed" ? (
                              <button type="button" onClick={() => void onExecuteBulkBatch(batch.id)} disabled={bulkLoading} className={subtleButtonClass + " mt-2"} data-testid="bulk-execute-button">Execute Batch</button>
                            ) : null}
                          </article>
                        ))}
                        {!bulkBatches.length ? <p className="text-xs text-slate-400">No onboarding batches yet.</p> : null}
                      </div>
                    </article>
                  </div>
                ) : null}
              </section>

              <section className={panelClass + " lg:col-span-2"} data-testid="notifications-panel">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Notification Infrastructure</h3>
                  <button
                    type="button"
                    data-testid="notifications-toggle"
                    onClick={() => setShowNotificationsPanel((prev) => !prev)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                  >
                    {showNotificationsPanel ? "Collapse" : "Expand"}
                  </button>
                </div>
                {showNotificationsPanel ? (
                  <div className="grid gap-3 lg:grid-cols-2" data-testid="notifications-body">
                    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-3" data-testid="notification-preferences-panel">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Preferences & Subscriptions</p>
                      <div className="mt-2 grid gap-2">
                        <input value={prefEventType} onChange={(event) => setPrefEventType(event.target.value)} placeholder="Event type (e.g. safeguarding.alert)" className={fieldClass} data-testid="notification-event-type-input" />
                        <select value={prefMinSeverity} onChange={(event) => setPrefMinSeverity(event.target.value as "info" | "warning" | "critical")} className={fieldClass} data-testid="notification-min-severity">
                          <option value="info">Info</option>
                          <option value="warning">Warning</option>
                          <option value="critical">Critical</option>
                        </select>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={prefEmailEnabled} onChange={(event) => setPrefEmailEnabled(event.target.checked)} data-testid="notif-email-toggle" /> Email</label>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={prefSmsEnabled} onChange={(event) => setPrefSmsEnabled(event.target.checked)} data-testid="notif-sms-toggle" /> SMS</label>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={prefWhatsAppEnabled} onChange={(event) => setPrefWhatsAppEnabled(event.target.checked)} data-testid="notif-whatsapp-toggle" /> WhatsApp</label>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void onSaveNotificationPreference()} disabled={saving || !selectedSchoolId} className={primaryButtonClass} data-testid="notification-save-pref-button">Save Preferences</button>
                          <button type="button" onClick={() => void loadNotificationData()} disabled={notificationsLoading || !selectedSchoolId} className={subtleButtonClass} data-testid="notification-refresh-button">Refresh</button>
                        </div>
                      </div>
                      <div className="mt-3 rounded border border-slate-700 bg-slate-900/60 p-2 text-xs text-slate-300">
                        <p className="font-semibold text-slate-100">Policy Controls</p>
                        <p>SLA breach alerts: {prefMinSeverity === "critical" ? "Critical only" : "Warning and above"}</p>
                        <p>Safeguarding escalations: {prefEmailEnabled || prefSmsEnabled || prefWhatsAppEnabled ? "Enabled" : "Disabled"}</p>
                        <p>Onboarding reminders: {notificationPrefs.some((pref) => (pref.eventType ?? "").includes("onboarding")) ? "Configured" : "Default"}</p>
                      </div>
                    </article>

                    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-3" data-testid="notification-manual-dispatch-panel">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Manual Dispatch / Test Action</p>
                      <div className="mt-2 grid gap-2">
                        <input value={manualEventType} onChange={(event) => setManualEventType(event.target.value)} className={fieldClass} data-testid="notification-manual-event-type" />
                        <select value={manualEventSeverity} onChange={(event) => setManualEventSeverity(event.target.value as "info" | "warning" | "critical")} className={fieldClass} data-testid="notification-manual-severity">
                          <option value="info">Info</option>
                          <option value="warning">Warning</option>
                          <option value="critical">Critical</option>
                        </select>
                        <textarea value={manualEventPayload} onChange={(event) => setManualEventPayload(event.target.value)} rows={4} className={fieldClass} data-testid="notification-manual-payload" />
                        <button type="button" onClick={() => void onManualNotificationDispatch()} disabled={saving || !selectedSchoolId} className={primaryButtonClass} data-testid="notification-dispatch-button">Create + Dispatch Test Event</button>
                      </div>
                    </article>

                    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 lg:col-span-2" data-testid="notification-events-list">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Event & Delivery Status History</p>
                      <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                        {notificationsLoading ? <p className="text-xs text-slate-400">Loading notification events...</p> : null}
                        {!notificationsLoading && notificationEvents.length === 0 ? <p className="text-xs text-slate-400">No notification events yet.</p> : null}
                        {notificationEvents.slice(0, 20).map((event) => (
                          <article key={event.id} className="rounded border border-slate-700 bg-slate-900/60 p-2 text-xs text-slate-200" data-testid="notification-event-row">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold">{event.eventType}</p>
                              <div className="flex gap-2">
                                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(event.severity)}`}>{event.severity}</span>
                                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(event.status)}`}>{event.status}</span>
                              </div>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">{shortDateTime(event.createdAt)} · Deliveries: {event.deliveries.length}</p>
                            <div className="mt-1 grid gap-1 sm:grid-cols-3" data-testid="notification-delivery-statuses">
                              {event.deliveries.slice(0, 6).map((delivery) => (
                                <div key={delivery.id} className="rounded border border-slate-700 bg-slate-950/60 p-1">
                                  <p className="font-semibold">{delivery.channel}</p>
                                  <p>{delivery.recipient}</p>
                                  <p className={delivery.status === "failed" ? "text-rose-200" : "text-slate-300"}>{delivery.status}</p>
                                </div>
                              ))}
                              {!event.deliveries.length ? <p className="text-[11px] text-slate-500">Pending delivery.</p> : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>
                  </div>
                ) : null}
              </section>
            </div>
            </AdminSectionCard>
          </div>
        </>
      ) : null}

      <style jsx>{`
        .wizard-step-panel {
          animation: wizardStepIn 240ms ease-out;
        }

        @keyframes wizardStepIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
