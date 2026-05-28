'use client';

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import ChildManagementForm from "./ChildManagementForm";
import BillingCard from "./BillingCard";
import SecuritySettings from "./SecuritySettings";
import ConsentAuditView from "./ConsentAuditView";
import NotificationPreferences from "./NotificationPreferences";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import CertificateShareControls from "@/components/certificates/CertificateShareControls";
import CurriculumMasteryMap from "@/components/academic-intelligence/CurriculumMasteryMap";
import { resolveDashboardTier, dashboardTierLabel, isProfileComplete } from "@/lib/dashboardResolver";
import type { CoverageEntry, SchoolWeekday } from "@/lib/academic-intelligence/types";
import type { RankedCertificateType, RankingMethod } from "@/lib/ranked-certificates";

type PortalSection =
  | "dashboard"
  | "children"
  | "billing"
  | "progress"
  | "tutor-history"
  | "rewards"
  | "consent"
  | "messages"
  | "support";

type AccountPayload = {
  account: {
    id: string;
    name: string;
    email: string;
    linkedChildrenCount: number;
    subscriptionStatus: string;
    subscriptionState: string;
    childLimit: number;
    renewalDate: string | null;
    stripeCustomerId: string | null;
    security?: {
      lastPasswordChangedAt: string | null;
    };
  };
  activeChild: { id: string; name: string; avatar: string | null } | null;
  notifications: {
    emailWeeklyReport: boolean;
    assignmentAlerts: boolean;
    lessonReminders: boolean;
    rewardNotifications: boolean;
    productUpdates: boolean;
  };
  contact: {
    phone: string;
    phoneE164: string;
    addressLine1: string;
    addressLine2: string;
    townCity: string;
    county: string;
    postcode: string;
    country: string;
  };
};

type ChildListResponse = {
  children: Array<{
    id: string;
    name: string;
    avatar: string | null;
    archived?: boolean;
    ageYears?: number;
    yearGroup?: string;
    schoolYear?: string;
    keyStageLevel?: string;
    subjectLevel?: string;
    dateOfBirth?: string | null;
    learningGoals?: string[];
    senSupportNeeds?: string;
    selectedSubjects?: string[];
  }>;
  activeChildId: string | null;
};

type SubscriptionPayload = {
  subscription: {
    pricingPlanId: string | null;
    planName: string;
    badge: string;
    status: string;
    provider: string;
    currentPricePence: number;
    currentCurrency: string;
    currentInterval: "month" | "year" | "custom";
    childLimit: number;
    childrenUsed: number;
    upgradeRequired: boolean;
    reason: string | null;
    renewalDate: string | null;
    trialEndsAt: string | null;
  };
  plans: Array<{
    id: string;
    key: string;
    name: string;
    stripePriceId: string | null;
    childLimit: number;
    description: string;
    features: string[];
    monthlyPricePence: number | null;
    yearlyPricePence: number | null;
    price: number;
    currency: string;
    interval: "month" | "year" | "custom";
    badge: string | null;
    changeType?: "current" | "upgrade" | "downgrade" | "switch";
  }>;
};

type ConsentPayload = {
  accepted: boolean;
  version: string | null;
  acceptedAt: string | null;
  withdrawnAt: string | null;
  auditHistory?: Array<{ id: string; status: "accepted" | "withdrawn"; version: string; timestamp: string }>;
};

type SupportTicket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
};

type MessageThread = {
  id: string;
  channel: "text" | "whatsapp";
  contactLabel: string | null;
  contactAddress: string;
  unreadCount: number;
  parentUnreadCount: number;
  lastMessageAt: string;
  lastMessage: string;
  lastDirection: "inbound" | "outbound";
};

type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  actorUserId: string | null;
  createdAt: string;
};

type MessagesPayload = {
  threads: MessageThread[];
  selectedThreadId: string | null;
  messages: ThreadMessage[];
};

type ChildDetail = {
  child: {
    id: string;
    name: string;
    avatar: string | null;
    age: number | null;
    level: string | null;
    archived: boolean;
  };
  progressRecords: Array<{ id: string; skill: string; level: string; score: number; updatedAt: string }>;
  walletSummary: { balance: number; earned: number; spent: number };
  recentLevelDecisions: Array<{ id: string; reason: string | null; createdAt: string }>;
  purchaseHistory: Array<{ 
    id: string; 
    itemName: string; 
    cost: number; 
    createdAt: string;
    approvalStatus?: "pending" | "approved" | "rejected";
    reviewNote?: string;
  }>;
};

type InsightsPayload = {
  strengths: Array<{ topic: string; accuracy: number; attempts: number }>;
  weaknesses: Array<{ topic: string; accuracy: number; attempts: number }>;
  averageAccuracy: number;
  totalAttempts: number;
  learningMode: string | null;
  activity: Array<{ date: string; count: number }>;
  lastActivityAt: string | null;
  learningDna?: Array<{
    childId: string;
    childName: string;
    totalAttempts?: number;
    enoughHistory?: boolean;
    readinessLabel?: string;
    fallbackMessage?: string | null;
    confidenceTrend?: number;
    preferredPace?: string;
    recommendations?: string[];
  }>;
};

type ChildAssignment = {
  id: string;
  status: string;
  title: string;
  subject: string;
  difficulty?: number;
  createdAt: string;
  href?: string;
};

type ChildAssignmentsPayload = {
  assignments: ChildAssignment[];
};

type ParentAcademicIntelligencePayload = {
  summary: {
    totalTopics: number;
    needsCatchUpCount: number;
    needsRevisionCount: number;
    coveredCount: number;
    averageScore: number;
  };
  curriculumCoverage?: CoverageEntry[];
  catchUpRecommendations: Array<{
    id: string;
    title: string;
    subject: string;
    topic?: string | null;
    reason: string;
    studentFriendlyReason?: string;
    estimatedMinutes: number;
    status: "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";
  }>;
  catchUpTasks?: Array<{
    taskId: string;
    recommendationId: string;
    title: string;
    subject: string;
    topic?: string | null;
    status: "recommended" | "scheduled" | "active" | "in_progress" | "completed" | "skipped" | "waived" | "overdue";
    estimatedMinutes: number;
    dueDate?: string | null;
    scheduledDay?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null;
    note?: string | null;
  }>;
  homeworkTasks?: Array<{
    taskId: string;
    blockId: string;
    title: string;
    subject?: string | null;
    topic?: string | null;
    status: "assigned" | "in_progress" | "completed" | "waived" | "overdue";
    estimatedMinutes: number;
    dueDate?: string | null;
    scheduledDay?: SchoolWeekday | null;
    note?: string | null;
  }>;
  assessmentReadiness: string;
  gcseReadiness: {
    applicable: boolean;
    readinessStatus: string;
    examBoard?: string | null;
    coverageGapCount: number;
  } | null;
  schoolWeekModePlan?: {
    enabled: boolean;
    strategy: string;
    totalEstimatedMinutes: number;
    days: Array<{
      day: SchoolWeekday;
      focus: string;
      estimatedMinutes: number;
    }>;
    dailySchedules: Array<{
      day: SchoolWeekday;
      totalMinutes: number;
      blocks: Array<{
        blockId: string;
        title: string;
        activityType: string;
        startTime: string;
        endTime: string;
        friendlyLabel: string;
      }>;
    }>;
    settings: {
      enabled: boolean;
      activeDays: SchoolWeekday[];
      startTime: string;
      endTime: string;
      lessonBlockMinutes: number;
      shortBreakMinutes: number;
      lunchMinutes: number;
      dailySubjectLimit: number;
      weeklySubjectSelection: string[];
      includeCatchUpTasks: boolean;
      includeRevisionBlocks: boolean;
      includeHomeworkBlock: boolean;
      includeQuizReviewBlock: boolean;
      includeWellbeingBlock: boolean;
      includeEndOfDaySummary: boolean;
    };
  };
  reviewActions: Array<{ action: string; label: string; persistenceSupported: boolean; message: string }>;
  parentExplanation: string;
};

type SchoolWeekSettingsPayload = {
  enabled: boolean;
  activeDays: SchoolWeekday[];
  startTime: string;
  endTime: string;
  lessonBlockMinutes: number;
  shortBreakMinutes: number;
  lunchMinutes: number;
  dailySubjectLimit: number;
  weeklySubjectSelection: string[];
  includeCatchUpTasks: boolean;
  includeRevisionBlocks: boolean;
  includeHomeworkBlock: boolean;
  includeQuizReviewBlock: boolean;
  includeWellbeingBlock: boolean;
  includeEndOfDaySummary: boolean;
  parentAdminNotes?: string | null;
};

type ParentCertificateLibraryEntry = {
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  certificateType:
    | "term_completion"
    | "end_of_term_exam"
    | "subject_achievement"
    | "english_achievement"
    | "mastery_certificate"
    | "award_certificate"
    | RankedCertificateType;
  typeLabel: string;
  typeGroupLabel: string;
  title: string;
  awardType: string | null;
  awardScope: string | null;
  awardSourceType: string | null;
  awardSourceId: string | null;
  subject: string | null;
  strand: string | null;
  score: number | null;
  yearGroup: string | null;
  keyStage: string | null;
  level: string | null;
  term: string;
  issuedAt: string;
  status: "issued" | "revoked";
  studentDisplayName: string;
  competitionName: string | null;
  testName: string | null;
  rank: number | null;
  rankLabel: string | null;
  tiedRank: boolean | null;
  rankingMethod: RankingMethod | null;
};

type ParentCertificatesPayload = {
  ok?: boolean;
  child?: {
    id: string;
    name: string;
    studentDisplayName: string;
    yearGroup: string | null;
    keyStage: string | null;
  };
  certificates?: ParentCertificateLibraryEntry[];
  error?: string;
};

const sections: Array<{ id: PortalSection; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "children", label: "Children" },
  { id: "billing", label: "Billing" },
  { id: "progress", label: "Progress" },
  { id: "tutor-history", label: "Tutor history" },
  { id: "rewards", label: "Rewards" },
  { id: "consent", label: "Consent" },
  { id: "messages", label: "Messages" },
  { id: "support", label: "Support" },
];

const sectionHref: Record<PortalSection, string> = {
  dashboard: "/parent/dashboard",
  children: "/parent/children",
  billing: "/parent/billing",
  progress: "/parent/progress",
  "tutor-history": "/parent/tutor-history",
  rewards: "/parent/rewards",
  consent: "/parent/consent",
  messages: "/parent/messages",
  support: "/parent/support",
};

const pathToSection = new Map<string, PortalSection>(
  Object.entries(sectionHref).map(([id, href]) => [href, id as PortalSection]),
);

const SCHOOL_WEEK_DAYS: SchoolWeekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const defaultSchoolWeekSettings: SchoolWeekSettingsPayload = {
  enabled: true,
  activeDays: [...SCHOOL_WEEK_DAYS],
  startTime: "16:00",
  endTime: "19:00",
  lessonBlockMinutes: 35,
  shortBreakMinutes: 10,
  lunchMinutes: 30,
  dailySubjectLimit: 2,
  weeklySubjectSelection: [],
  includeCatchUpTasks: true,
  includeRevisionBlocks: true,
  includeHomeworkBlock: true,
  includeQuizReviewBlock: true,
  includeWellbeingBlock: false,
  includeEndOfDaySummary: true,
  parentAdminNotes: null,
};

function currency(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value / 100);
}

function formatLastActivity(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function sectionLabel(section: PortalSection) {
  return sections.find((item) => item.id === section)?.label ?? "Dashboard";
}

export default function ParentPortalShell({ section }: { section: PortalSection }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [children, setChildren] = useState<ChildListResponse | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionPayload | null>(null);
  const [consent, setConsent] = useState<ConsentPayload | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childDetail, setChildDetail] = useState<ChildDetail | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [childAssignments, setChildAssignments] = useState<ChildAssignment[]>([]);
  const [academicIntelligence, setAcademicIntelligence] = useState<ParentAcademicIntelligencePayload | null>(null);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [academicActionTaskId, setAcademicActionTaskId] = useState<string | null>(null);
  const [schoolWeekSettings, setSchoolWeekSettings] = useState<SchoolWeekSettingsPayload>(defaultSchoolWeekSettings);
  const [schoolWeekSaving, setSchoolWeekSaving] = useState(false);
  const [schoolWeekMessage, setSchoolWeekMessage] = useState<string | null>(null);
  const [childCertificates, setChildCertificates] = useState<ParentCertificateLibraryEntry[]>([]);
  const [childCertificatesLoading, setChildCertificatesLoading] = useState(false);
  const [childCertificatesError, setChildCertificatesError] = useState<string | null>(null);
  const [previewByCertificate, setPreviewByCertificate] = useState<Record<string, boolean>>({});
  const [childPanelsLoading, setChildPanelsLoading] = useState(false);
  const [childPanelsLoadedFor, setChildPanelsLoadedFor] = useState<string | null>(null);
  const [goingToDashboard, setGoingToDashboard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportBody, setSupportBody] = useState("");
  const [notificationsDraft, setNotificationsDraft] = useState({
    emailWeeklyReport: true,
    assignmentAlerts: true,
    lessonReminders: true,
    rewardNotifications: true,
    productUpdates: false,
  });
  const [showChildForm, setShowChildForm] = useState(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [childFormMessage, setChildFormMessage] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [accountContactDraft, setAccountContactDraft] = useState({
    phone: "",
    addressLine1: "",
    addressLine2: "",
    townCity: "",
    county: "",
    postcode: "",
    country: "United Kingdom",
  });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch("/student/dashboard");
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const pinStatusResponse = await fetch("/api/pin/status", { credentials: "include", cache: "no-store" });
      if (cancelled) return;
      if (pinStatusResponse.status === 401) {
        router.replace("/auth/login");
        return;
      }
      if (pinStatusResponse.ok) {
        const pinStatus = (await pinStatusResponse.json()) as { hasPin?: boolean; unlocked?: boolean };
        if (!pinStatus.hasPin) {
          const next = pathname ?? `/parent/${section}`;
          router.replace(`/parent-pin?reset=1&next=${encodeURIComponent(next)}`);
          return;
        }
        if (!pinStatus.unlocked) {
          const next = pathname ?? `/parent/${section}`;
          router.replace(`/parent/profiles?intent=parent&next=${encodeURIComponent(next)}`);
          return;
        }
      }

      setLoading(true);
      const [accountRes, childrenRes, subscriptionRes, consentRes] = await Promise.all([
        fetch("/api/account", { credentials: "include" }),
        fetch("/api/children", { credentials: "include" }),
        fetch("/api/subscription", { credentials: "include" }),
        fetch("/api/consent", { credentials: "include" }),
      ]);

      if (cancelled) return;

      if (accountRes.ok) {
        const payload = (await accountRes.json()) as AccountPayload;
        setAccount(payload);
        setNotificationsDraft(payload.notifications);
        setSelectedChildId(payload.activeChild?.id ?? null);
        setAccountNameDraft(payload.account.name ?? "");
        setAccountContactDraft({
          phone: payload.contact?.phone ?? "",
          addressLine1: payload.contact?.addressLine1 ?? "",
          addressLine2: payload.contact?.addressLine2 ?? "",
          townCity: payload.contact?.townCity ?? "",
          county: payload.contact?.county ?? "",
          postcode: payload.contact?.postcode ?? "",
          country: payload.contact?.country ?? "United Kingdom",
        });
      }

      if (childrenRes.ok) {
        setChildren((await childrenRes.json()) as ChildListResponse);
      }

      if (subscriptionRes.ok) {
        setSubscription((await subscriptionRes.json()) as SubscriptionPayload);
      }

      if (consentRes.ok) {
        setConsent((await consentRes.json()) as ConsentPayload);
      }

      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, section]);

  useEffect(() => {
    if (loading || !selectedChildId) return;

    const resolvedSection = pathname && pathToSection.has(pathname)
      ? (pathToSection.get(pathname) as PortalSection)
      : section;
    const summaryMode = resolvedSection === "dashboard";
    const loadKey = `${selectedChildId}:${summaryMode ? "summary" : "full"}`;
    if (childPanelsLoadedFor === loadKey) return;

    let cancelled = false;

    const timer = window.setTimeout(() => {
      async function loadChildPanels() {
        setChildPanelsLoading(true);
        setAcademicLoading(true);
        setChildCertificatesLoading(true);
        setAcademicError(null);
        setChildCertificatesError(null);

        try {
          const [childRes, insightsRes, assignmentsRes, academicRes, certificatesRes, schoolWeekRes, ticketsRes, messagesRes] = await Promise.all([
            fetch(`/api/children/${selectedChildId}/data${summaryMode ? "?summary=1" : ""}`, { credentials: "include" }),
            fetch(`/api/parent/insights${summaryMode ? "?summary=1" : ""}`, { credentials: "include" }),
            fetch(`/api/assignments?childId=${encodeURIComponent(selectedChildId ?? "")}`, { credentials: "include" }),
            fetch(`/api/parent/academic-intelligence?childId=${encodeURIComponent(selectedChildId ?? "")}`, { credentials: "include" }),
            fetch(`/api/parent/students/${encodeURIComponent(selectedChildId ?? "")}/certificates`, { credentials: "include" }),
            fetch(`/api/parent/students/${encodeURIComponent(selectedChildId ?? "")}/school-week-settings`, { credentials: "include" }),
            fetch("/api/parent/support", { credentials: "include" }),
            fetch("/api/parent/messages", { credentials: "include" }),
          ]);

          if (cancelled) return;

          if (childRes.ok) {
            setChildDetail((await childRes.json()) as ChildDetail);
          }

          if (insightsRes.ok) {
            setInsights((await insightsRes.json()) as InsightsPayload);
          }

          if (assignmentsRes.ok) {
            const payload = (await assignmentsRes.json()) as ChildAssignmentsPayload;
            setChildAssignments(payload.assignments ?? []);
          } else {
            setChildAssignments([]);
          }

          if (academicRes.ok) {
            setAcademicIntelligence((await academicRes.json()) as ParentAcademicIntelligencePayload);
            setAcademicError(null);
          } else {
            const payload = await academicRes.json().catch(() => null) as { error?: string } | null;
            setAcademicIntelligence(null);
            setAcademicError(payload?.error ?? "Unable to load academic intelligence.");
          }

          if (certificatesRes.ok) {
            const payload = (await certificatesRes.json()) as ParentCertificatesPayload;
            setChildCertificates(payload.certificates ?? []);
            setChildCertificatesError(null);
          } else {
            const payload = (await certificatesRes.json().catch(() => null)) as { error?: string } | null;
            setChildCertificates([]);
            setChildCertificatesError(payload?.error ?? "Unable to load child certificates.");
          }

          if (schoolWeekRes.ok) {
            const payload = (await schoolWeekRes.json()) as { settings?: SchoolWeekSettingsPayload };
            setSchoolWeekSettings(payload.settings ?? defaultSchoolWeekSettings);
          } else {
            setSchoolWeekSettings(defaultSchoolWeekSettings);
          }

          if (ticketsRes.ok) {
            const payload = (await ticketsRes.json()) as { tickets: SupportTicket[] };
            setTickets(payload.tickets ?? []);
          }

          if (messagesRes.ok) {
            const payload = (await messagesRes.json()) as MessagesPayload;
            setThreads(payload.threads ?? []);
            setActiveThreadId(payload.selectedThreadId ?? null);
            setThreadMessages(payload.messages ?? []);
          }

          setChildPanelsLoadedFor(loadKey);
        } finally {
          if (!cancelled) {
            setAcademicLoading(false);
            setChildCertificatesLoading(false);
            setChildPanelsLoading(false);
          }
        }
      }

      void loadChildPanels();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [childPanelsLoadedFor, loading, pathname, section, selectedChildId]);

  useEffect(() => {
    if (loading) return;
    const resolvedSection = pathname && pathToSection.has(pathname)
      ? (pathToSection.get(pathname) as PortalSection)
      : section;
    if (resolvedSection !== "support") return;
    if (tickets.length > 0) return;

    let cancelled = false;

    async function loadSupportTickets() {
      const refreshed = await fetch("/api/parent/support", { credentials: "include" });
      if (!refreshed.ok || cancelled) return;
      const payload = (await refreshed.json()) as { tickets: SupportTicket[] };
      if (!cancelled) {
        setTickets(payload.tickets ?? []);
      }
    }

    void loadSupportTickets();
    return () => {
      cancelled = true;
    };
  }, [loading, pathname, section, tickets.length]);

  useEffect(() => {
    if (loading) return;
    const resolvedSection = pathname && pathToSection.has(pathname)
      ? (pathToSection.get(pathname) as PortalSection)
      : section;
    if (resolvedSection !== "messages") return;
    if (threads.length > 0 || threadMessages.length > 0) return;

    let cancelled = false;

    async function loadMessages() {
      const response = await fetch("/api/parent/messages", { credentials: "include" });
      if (!response.ok || cancelled) return;
      const payload = (await response.json()) as MessagesPayload;
      if (!cancelled) {
        setThreads(payload.threads ?? []);
        setActiveThreadId(payload.selectedThreadId ?? null);
        setThreadMessages(payload.messages ?? []);
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [loading, pathname, section, threadMessages.length, threads.length]);

  const activeChild = useMemo(() => {
    if (!children?.children?.length) return null;
    return children.children.find((child) => child.id === selectedChildId) ?? children.children[0] ?? null;
  }, [children, selectedChildId]);

  const activeSection = useMemo<PortalSection>(() => {
    if (!pathname) return section;
    if (pathToSection.has(pathname)) {
      return pathToSection.get(pathname) as PortalSection;
    }
    return section;
  }, [pathname, section]);

  const activeLearningDna = useMemo(() => {
    if (!selectedChildId || !insights?.learningDna?.length) return null;
    return insights.learningDna.find((entry) => entry.childId === selectedChildId) ?? null;
  }, [insights, selectedChildId]);

  const handleAcademicTaskAction = useCallback(async (
    taskId: string,
    action: "approve_catch_up" | "reschedule_catch_up" | "waive_catch_up" | "add_note",
  ) => {
    if (!selectedChildId) return;
    setAcademicActionTaskId(taskId);
    setAcademicError(null);
    try {
      const dueDate = action === "reschedule_catch_up"
        ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const response = await fetch("/api/parent/academic-intelligence/catch-up-tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: selectedChildId,
          taskId,
          action,
          dueDate,
          note: action === "add_note" ? "Parent reviewed this task and added context." : null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to update catch-up task.");
      }

      const refresh = await fetch(`/api/parent/academic-intelligence?childId=${encodeURIComponent(selectedChildId)}&includeSync=1`, { credentials: "include" });
      if (refresh.ok) {
        setAcademicIntelligence((await refresh.json()) as ParentAcademicIntelligencePayload);
      }
    } catch (err) {
      setAcademicError(err instanceof Error ? err.message : "Unable to update catch-up task.");
    } finally {
      setAcademicActionTaskId(null);
    }
  }, [selectedChildId]);

  const saveSchoolWeekSettings = useCallback(async () => {
    if (!selectedChildId) return;
    setSchoolWeekSaving(true);
    setSchoolWeekMessage(null);
    try {
      const response = await fetch(`/api/parent/students/${encodeURIComponent(selectedChildId)}/school-week-settings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schoolWeekSettings),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; settings?: SchoolWeekSettingsPayload } | null;
      if (!response.ok) {
        setSchoolWeekMessage(payload?.error ?? "Unable to save school week settings.");
        return;
      }

      if (payload?.settings) {
        setSchoolWeekSettings(payload.settings);
      }

      const refresh = await fetch(`/api/parent/academic-intelligence?childId=${encodeURIComponent(selectedChildId)}&includeSync=1`, { credentials: "include" });
      if (refresh.ok) {
        setAcademicIntelligence((await refresh.json()) as ParentAcademicIntelligencePayload);
      }
      setSchoolWeekMessage("School day and school week mode saved.");
    } catch {
      setSchoolWeekMessage("Unable to save school week settings.");
    } finally {
      setSchoolWeekSaving(false);
    }
  }, [schoolWeekSettings, selectedChildId]);

  const modeAdd = activeSection === "children" && searchParams.get("mode") === "add";
  const formVisible = modeAdd || showChildForm;
  const effectiveEditingChildId = modeAdd ? null : editingChildId;

  async function goToChildDashboard(childId: string) {
    setGoingToDashboard(true);
    const timeoutId = window.setTimeout(() => {
      setGoingToDashboard(false);
    }, 2500);
    try {
      await fetch("/api/children/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ childId }),
      });
      window.clearTimeout(timeoutId);
      router.push("/student/dashboard");
    } finally {
      window.clearTimeout(timeoutId);
      setGoingToDashboard(false);
    }
  }

  async function downloadProgressReport(format: "pdf" | "csv" | "excel") {
    if (!selectedChildId) return;
    setReportDownloading(true);
    try {
      const response = await fetch(
        `/api/parent/reports/export?childId=${encodeURIComponent(selectedChildId)}&range=30d&format=${format}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        window.alert(payload?.error ?? "Unable to generate report.");
        return;
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const nameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      const fallbackExt = format === "excel" ? "xls" : format;
      const filename = nameMatch?.[1] ?? `starliz-progress-report-${selectedChildId}.${fallbackExt}`;

      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } finally {
      setReportDownloading(false);
    }
  }

  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supportSubject.trim() || !supportBody.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/parent/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject: supportSubject, message: supportBody }),
      });
      setSupportSubject("");
      setSupportBody("");
      const refreshed = await fetch("/api/parent/support", { credentials: "include" });
      if (refreshed.ok) {
        const payload = (await refreshed.json()) as { tickets: SupportTicket[] };
        setTickets(payload.tickets ?? []);
      }
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/auth/login");
      setLoggingOut(false);
    }
  }

  async function saveAccountDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountSaving(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: accountNameDraft,
          contact: {
            ...accountContactDraft,
            postcode: accountContactDraft.postcode.toUpperCase(),
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setAccountError(payload?.error ?? "Unable to save account details right now.");
        return;
      }

      const accountRefresh = await fetch("/api/account", { credentials: "include" });
      if (accountRefresh.ok) {
        const refreshed = (await accountRefresh.json()) as AccountPayload;
        setAccount(refreshed);
        setNotificationsDraft(refreshed.notifications);
        setAccountNameDraft(refreshed.account.name ?? "");
        setAccountContactDraft({
          phone: refreshed.contact?.phone ?? "",
          addressLine1: refreshed.contact?.addressLine1 ?? "",
          addressLine2: refreshed.contact?.addressLine2 ?? "",
          townCity: refreshed.contact?.townCity ?? "",
          county: refreshed.contact?.county ?? "",
          postcode: refreshed.contact?.postcode ?? "",
          country: refreshed.contact?.country ?? "United Kingdom",
        });
      }
      setAccountMessage("Account details saved.");
    } catch {
      setAccountError("Unable to save account details right now.");
    } finally {
      setAccountSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100" data-testid="parent-portal-shell">
      <span className="sr-only" data-testid={`parent-active-section-${activeSection}`}>{activeSection}</span>
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.22),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.4em] text-cyan-300">Parent portal</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-6xl">{sectionLabel(activeSection)}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                A single place for children, billing, progress, consent, support, and account settings.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Children" value={account?.account.linkedChildrenCount ?? 0} />
              <StatCard label="Subscription" value={account?.account.subscriptionStatus ?? "loading"} />
              <StatCard label="Consent" value={consent?.accepted ? "Accepted" : "Pending"} />
            </div>
            <div className="flex justify-start lg:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="bg-rose-500/20 text-rose-100 hover:bg-rose-500/35"
                onClick={() => void logout()}
                disabled={loggingOut}
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </Button>
            </div>
          </div>

          <div className="-mx-1 overflow-x-auto">
            <div className="flex min-w-max gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
            {sections.map((item) => (
              <Link
                key={item.id}
                href={sectionHref[item.id]}
                className={`relative rounded-full px-4 py-2 text-sm font-semibold transition ${item.id === activeSection ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                {item.label}
                {item.id === "messages" && threads.reduce((sum, t) => sum + t.parentUnreadCount, 0) > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {threads.reduce((sum, t) => sum + t.parentUnreadCount, 0)}
                  </span>
                ) : null}
              </Link>
            ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8 xl:grid-cols-[1.8fr_1fr]">
        <div className="space-y-6">
          {loading ? (
            <Panel title="Loading portal" description="Fetching your account, children, and school support data."></Panel>
          ) : null}

          {activeSection === "dashboard" ? (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Active child" description="Switch between children and review the latest activity.">
                  <ChildPicker profiles={children?.children ?? []} selectedChildId={selectedChildId} setSelectedChildId={setSelectedChildId} />
                  {activeChild ? (
                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p>Child: <span className="font-semibold text-white">{activeChild.name}</span></p>
                          {activeChild.yearGroup && (
                            <p className="mt-1">Year group: <span className="font-semibold text-cyan-300">{activeChild.yearGroup}</span></p>
                          )}
                          {activeChild.ageYears && (
                            <p className="mt-1">Age: <span className="font-semibold text-cyan-300">{activeChild.ageYears} years</span></p>
                          )}
                          {activeChild.keyStageLevel && (
                            <p className="mt-1">Key Stage: <span className="font-semibold text-cyan-300">{activeChild.keyStageLevel}</span></p>
                          )}
                          <p className="mt-1">Dashboard: <span className="font-semibold text-white">{dashboardTierLabel(resolveDashboardTier({ yearGroup: activeChild.yearGroup, ageYears: activeChild.ageYears, dateOfBirth: activeChild.dateOfBirth }))}</span></p>
                          {childPanelsLoading ? (
                            <p className="mt-1 text-xs text-slate-400">Loading progress insights...</p>
                          ) : null}
                          {insights?.lastActivityAt && (
                            <p className="mt-1">Last active: <span className="font-semibold text-cyan-400">{formatLastActivity(insights.lastActivityAt)}</span></p>
                          )}
                          {!isProfileComplete({ yearGroup: activeChild.yearGroup, ageYears: activeChild.ageYears, dateOfBirth: activeChild.dateOfBirth }) && (
                            <p className="mt-2 text-xs text-amber-400">We&apos;re setting up the best learning view for this child.</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={goingToDashboard}
                        onClick={() => void goToChildDashboard(activeChild.id)}
                        className="mt-2 w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {goingToDashboard ? "Opening..." : `Go to ${activeChild.name}'s Dashboard`}
                      </button>
                    </div>
                  ) : null}
                </Panel>
                <Panel title="Plan and billing" description="Check renewal status and available child limit.">
                  <div className="space-y-3 text-sm text-slate-300">
                    <p>Plan: <span className="font-semibold text-white">{subscription?.subscription.planName ?? account?.account.subscriptionStatus ?? "Loading"}</span></p>
                    <p>Children used: <span className="font-semibold text-white">{subscription?.subscription.childrenUsed ?? 0}/{subscription?.subscription.childLimit ?? account?.account.childLimit ?? 0}</span></p>
                    <p>Renewal: <span className="font-semibold text-white">{subscription?.subscription.renewalDate ? new Date(subscription.subscription.renewalDate).toLocaleDateString() : "No renewal set"}</span></p>
                  </div>
                </Panel>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Account & Contact Details" description="Manage your parent profile, telephone, and UK address.">
                  <form className="space-y-3" onSubmit={saveAccountDetails}>
                    <label className="block text-sm font-semibold text-slate-300">
                      Parent full name
                      <input
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                        value={accountNameDraft}
                        onChange={(event) => setAccountNameDraft(event.target.value)}
                        autoComplete="name"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-300">
                      Telephone
                      <input
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                        value={accountContactDraft.phone}
                        onChange={(event) => setAccountContactDraft((prev) => ({ ...prev, phone: event.target.value }))}
                        autoComplete="tel"
                      />
                      <span className="mt-1 block text-xs text-slate-400">Enter a UK mobile or landline number</span>
                    </label>
                    <label className="block text-sm font-semibold text-slate-300">
                      Address line 1
                      <input
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                        value={accountContactDraft.addressLine1}
                        onChange={(event) => setAccountContactDraft((prev) => ({ ...prev, addressLine1: event.target.value }))}
                        autoComplete="address-line1"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-300">
                      Address line 2 (optional)
                      <input
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                        value={accountContactDraft.addressLine2}
                        onChange={(event) => setAccountContactDraft((prev) => ({ ...prev, addressLine2: event.target.value }))}
                        autoComplete="address-line2"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-semibold text-slate-300">
                        Town/City
                        <input
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                          value={accountContactDraft.townCity}
                          onChange={(event) => setAccountContactDraft((prev) => ({ ...prev, townCity: event.target.value }))}
                          autoComplete="address-level2"
                        />
                      </label>
                      <label className="block text-sm font-semibold text-slate-300">
                        County (optional)
                        <input
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                          value={accountContactDraft.county}
                          onChange={(event) => setAccountContactDraft((prev) => ({ ...prev, county: event.target.value }))}
                          autoComplete="address-level1"
                        />
                      </label>
                      <label className="block text-sm font-semibold text-slate-300">
                        Postcode
                        <input
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                          value={accountContactDraft.postcode}
                          onChange={(event) => setAccountContactDraft((prev) => ({ ...prev, postcode: event.target.value.toUpperCase() }))}
                          autoComplete="postal-code"
                        />
                      </label>
                      <label className="block text-sm font-semibold text-slate-300">
                        Country
                        <select
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                          value={accountContactDraft.country}
                          onChange={(event) => setAccountContactDraft((prev) => ({ ...prev, country: event.target.value }))}
                        >
                          <option>United Kingdom</option>
                        </select>
                      </label>
                    </div>
                    {accountError ? <p className="text-sm text-red-400">{accountError}</p> : null}
                    {accountMessage ? <p className="text-sm text-green-400">{accountMessage}</p> : null}
                    <Button type="submit" disabled={accountSaving}>{accountSaving ? "Saving..." : "Save account details"}</Button>
                  </form>
                </Panel>

                <Panel title="Notification Preferences" description="Choose what updates you receive from StarLiz.">
                  <NotificationPreferences
                    preferences={notificationsDraft}
                    onUpdate={(prefs) => {
                      setNotificationsDraft(prefs);
                    }}
                  />
                </Panel>
              </div>

              <SecuritySettings
                currentName={account?.account.name ?? ""}
                lastPasswordChangedAt={account?.account.security?.lastPasswordChangedAt ?? null}
                onUpdate={() => {
                  fetch("/api/account", { credentials: "include" })
                    .then(r => r.ok ? r.json() as Promise<AccountPayload> : null)
                    .then((data) => {
                      if (!data) return;
                      setAccount(data);
                    });
                }}
              />

              {(children?.children ?? []).length === 0 ? (
                <Panel title="Parent setup checklist" description="Complete these steps to start your first lesson.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ChecklistItem index={1} title="Add child" href="/parent/children?mode=add" cta="Add child" />
                    <ChecklistItem index={2} title="Confirm consent" href="/parent/consent" cta="Review consent" />
                    <ChecklistItem index={3} title="Choose plan" href="/parent/billing" cta="Choose plan" />
                    <ChecklistItem
                      index={4}
                      title="Start first lesson"
                      href="/student/dashboard"
                      cta="Start lesson"
                      disabled
                      helpText="Add a child first to start a lesson."
                    />
                  </div>
                </Panel>
              ) : null}

              {selectedChildId && childPanelsLoading && childAssignments.length === 0 ? (
                <Panel title="Assigned tasks" description="Loading assigned work for this child.">
                  <div className="space-y-2">
                    <div className="h-10 animate-pulse rounded-xl bg-white/10" />
                    <div className="h-10 animate-pulse rounded-xl bg-white/10" />
                    <div className="h-10 animate-pulse rounded-xl bg-white/10" />
                  </div>
                </Panel>
              ) : null}
              
              {selectedChildId && childAssignments.length > 0 ? (
                <Panel title="Assigned tasks" description={`${childAssignments.length} task${childAssignments.length !== 1 ? "s" : ""} assigned to ${activeChild?.name ?? "this child"}`}>
                  <div className="divide-y divide-white/10">
                    {childAssignments.slice(0, 8).map((assignment) => (
                      <div key={assignment.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">{assignment.title}</p>
                          <p className="mt-0.5 text-xs capitalize text-slate-400">{assignment.subject}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                          assignment.status === "in_progress" ? "bg-amber-400/20 text-amber-300" :
                          assignment.status === "completed" ? "bg-emerald-400/20 text-emerald-300" :
                          "bg-sky-400/20 text-sky-300"
                        }`}>
                          {assignment.status === "in_progress" ? "In Progress" : assignment.status === "completed" ? "Complete" : "Assigned"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {activeChild && (
                    <button
                      type="button"
                      disabled={goingToDashboard}
                      onClick={() => void goToChildDashboard(activeChild.id)}
                      className="mt-4 w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {goingToDashboard ? "Opening..." : `Go to ${activeChild.name}'s Dashboard`}
                    </button>
                  )}
                </Panel>
              ) : null}

              {selectedChildId ? (
                <Panel title="Child Certificates" description="Issued certificates for the selected child, including approved awards.">
                  <div className="mb-3">
                    <ChildPicker profiles={children?.children ?? []} selectedChildId={selectedChildId} setSelectedChildId={setSelectedChildId} />
                  </div>
                  {childCertificatesLoading ? (
                    <p className="text-sm text-slate-300">Loading certificates...</p>
                  ) : childCertificatesError ? (
                    <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{childCertificatesError}</p>
                  ) : childCertificates.length === 0 ? (
                    <EmptyState text="No certificates have been issued for this child yet." />
                  ) : (
                    <div className="space-y-3">
                      {childCertificates.map((item) => (
                        <article key={`${item.verificationCode}-${item.certificateNumber}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                          {(() => {
                            const previewKey = `${item.verificationCode}-${item.certificateNumber}`;
                            const previewOpen = previewByCertificate[previewKey] ?? false;
                            return (
                              <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-300">{item.typeGroupLabel}</p>
                              <h3 className="mt-1 font-semibold text-white">{item.title}</h3>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${item.status === "revoked" ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                              {item.status}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
                            <p>Child name: <span className="font-semibold text-white">{activeChild?.name ?? "Child"}</span></p>
                            <p>Certificate type: <span className="font-semibold text-white">{item.typeLabel}</span></p>
                            <p>Certificate number: <span className="font-mono font-semibold text-white">{item.certificateNumber}</span></p>
                            <p>Issued date: <span className="font-semibold text-white">{new Date(item.issuedAt).toLocaleDateString("en-GB")}</span></p>
                            {item.subject ? <p>Subject: <span className="font-semibold text-white">{item.subject}</span></p> : null}
                            {typeof item.score === "number" ? <p>Score: <span className="font-semibold text-white">{item.score}</span></p> : null}
                            {item.rankLabel ? <p>Rank / place: <span className="font-semibold text-white">{item.rankLabel}</span></p> : null}
                            {item.competitionName ? <p>Competition: <span className="font-semibold text-white">{item.competitionName}</span></p> : null}
                            {item.testName ? <p>Test / quiz / challenge: <span className="font-semibold text-white">{item.testName}</span></p> : null}
                            {item.awardSourceType ? <p>Award source type: <span className="font-semibold text-white">{item.awardSourceType.replaceAll("_", " ")}</span></p> : null}
                            {item.awardSourceId ? <p>Award source id: <span className="font-semibold text-white">{item.awardSourceId}</span></p> : null}
                            {typeof item.tiedRank === "boolean" ? <p>Tied rank: <span className="font-semibold text-white">{item.tiedRank ? "Yes" : "No"}</span></p> : null}
                            {item.rankingMethod ? <p>Ranking method: <span className="font-semibold text-white">{item.rankingMethod.replaceAll("_", " ")}</span></p> : null}
                            {item.level ? <p>Level: <span className="font-semibold text-white">{item.level}</span></p> : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                            <a href={item.verificationUrl} className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-white/10">
                              Verification link
                            </a>
                            {selectedChildId && item.status === "issued" ? (
                              <a
                                href={`/api/parent/students/${encodeURIComponent(selectedChildId)}/certificates/${encodeURIComponent(item.verificationCode)}/export?store=1`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-xl border border-emerald-300/70 bg-emerald-300/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/25"
                              >
                                Print / Save as PDF
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewByCertificate((prev) => ({
                                  ...prev,
                                  [previewKey]: !previewOpen,
                                }));
                              }}
                              className="rounded-xl border border-amber-300/70 bg-amber-300/15 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-300/25"
                            >
                              {previewOpen ? "Hide certificate preview" : "Preview certificate"}
                            </button>
                            <Link href={`/certificates/verify/${encodeURIComponent(item.verificationCode)}`} className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400">
                              Open verification page
                            </Link>
                          </div>

                          <div className="mt-3 print:hidden">
                            <CertificateShareControls verificationUrl={item.verificationUrl} compact />
                          </div>

                          {previewOpen ? (
                            <div className="mt-4">
                              <CertificatePreview
                                title={item.title}
                                studentDisplayName={item.studentDisplayName}
                                certificateType={item.certificateType}
                                typeLabel={item.typeLabel}
                                yearGroup={item.yearGroup}
                                keyStage={item.level ?? item.keyStage}
                                term={item.term}
                                subject={item.subject}
                                strand={item.strand}
                                awardType={item.awardType}
                                awardScope={item.awardScope}
                                issuedAt={item.issuedAt}
                                certificateNumber={item.certificateNumber}
                                verificationCode={item.verificationCode}
                                verificationUrl={item.verificationUrl}
                                score={item.score}
                                competitionName={item.competitionName}
                                testName={item.testName}
                                rank={item.rank}
                                rankLabel={item.rankLabel}
                                tiedRank={item.tiedRank}
                                rankingMethod={item.rankingMethod}
                                status={item.status}
                                showPrintAction={item.status === "issued"}
                              />
                            </div>
                          ) : null}
                              </>
                            );
                          })()}
                        </article>
                      ))}
                    </div>
                  )}
                </Panel>
              ) : null}

              {selectedChildId ? (
                <Panel title="Academic Intelligence" description="Mastery, catch-up, and assessment readiness insights.">
                  {academicLoading ? (
                    <p className="text-sm text-slate-300">Loading academic intelligence...</p>
                  ) : academicError ? (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                      <p>{academicError}</p>
                    </div>
                  ) : !academicIntelligence ? (
                    <div className="space-y-1 text-sm text-slate-300">
                      <p>No mastery data yet.</p>
                      <p>Complete a lesson to build your mastery map.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <Metric label="Covered" value={`${academicIntelligence.summary.coveredCount}/${academicIntelligence.summary.totalTopics}`} />
                        <Metric label="Catch-up required" value={String(academicIntelligence.summary.needsCatchUpCount)} />
                        <Metric label="Needs revision" value={String(academicIntelligence.summary.needsRevisionCount)} />
                        <Metric label="Average score" value={`${academicIntelligence.summary.averageScore}%`} />
                      </div>

                      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-cyan-100">School Day and School Week Mode</p>
                            <p className="text-xs text-cyan-100/80">Set active days, timing, and learning block mix for your child.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void saveSchoolWeekSettings()}
                            disabled={schoolWeekSaving}
                            className="rounded-lg border border-cyan-300/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:opacity-60"
                          >
                            {schoolWeekSaving ? "Saving..." : "Save school week mode"}
                          </button>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-4">
                          <label className="text-xs text-slate-300">Start time
                            <input
                              type="time"
                              value={schoolWeekSettings.startTime}
                              onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, startTime: event.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                            />
                          </label>
                          <label className="text-xs text-slate-300">End time
                            <input
                              type="time"
                              value={schoolWeekSettings.endTime}
                              onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, endTime: event.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                            />
                          </label>
                          <label className="text-xs text-slate-300">Lesson block (mins)
                            <input
                              type="number"
                              min={20}
                              max={90}
                              value={schoolWeekSettings.lessonBlockMinutes}
                              onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, lessonBlockMinutes: Number(event.target.value) || 35 }))}
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                            />
                          </label>
                          <label className="text-xs text-slate-300">Subjects per day
                            <input
                              type="number"
                              min={1}
                              max={4}
                              value={schoolWeekSettings.dailySubjectLimit}
                              onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, dailySubjectLimit: Number(event.target.value) || 2 }))}
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                            />
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {SCHOOL_WEEK_DAYS.map((day) => {
                            const selected = schoolWeekSettings.activeDays.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => setSchoolWeekSettings((current) => {
                                  const nextDays = selected
                                    ? current.activeDays.filter((item) => item !== day)
                                    : [...current.activeDays, day];
                                  return { ...current, activeDays: nextDays };
                                })}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${selected ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={schoolWeekSettings.includeCatchUpTasks}
                              onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, includeCatchUpTasks: event.target.checked }))}
                            />
                            Include catch-up tasks
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={schoolWeekSettings.includeRevisionBlocks}
                              onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, includeRevisionBlocks: event.target.checked }))}
                            />
                            Include revision block
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={schoolWeekSettings.includeHomeworkBlock}
                              onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, includeHomeworkBlock: event.target.checked }))}
                            />
                            Include homework block
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={schoolWeekSettings.includeEndOfDaySummary}
                              onChange={(event) => setSchoolWeekSettings((current) => ({ ...current, includeEndOfDaySummary: event.target.checked }))}
                            />
                            Include end-of-day summary
                          </label>
                        </div>

                        {schoolWeekMessage ? <p className="mt-2 text-xs text-cyan-100">{schoolWeekMessage}</p> : null}

                        {academicIntelligence.schoolWeekModePlan?.dailySchedules?.length ? (
                          <div className="mt-3 grid gap-2 lg:grid-cols-2">
                            {academicIntelligence.schoolWeekModePlan.dailySchedules.slice(0, 2).map((day) => (
                              <div key={day.day} className="rounded-lg border border-cyan-400/20 bg-slate-900/60 p-2">
                                <p className="text-xs font-semibold text-cyan-100">{day.day} ({day.totalMinutes} mins)</p>
                                <p className="mt-1 text-xs text-slate-300">{day.blocks.slice(0, 2).map((item) => `${item.startTime} ${item.title}`).join(" • ") || "No planned blocks"}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <CurriculumMasteryMap
                        variant="dark"
                        title="Curriculum Mastery Map"
                        subtitle="See each subject, level, and topic status before catch-up is assigned or reviewed."
                        eyebrow="Mastery map"
                        summary={academicIntelligence.summary}
                        rows={academicIntelligence.curriculumCoverage ?? []}
                      />

                      {(academicIntelligence.catchUpTasks ?? []).length === 0 && academicIntelligence.catchUpRecommendations.length === 0 ? (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                          <p className="font-semibold">No catch-up needed right now.</p>
                          <p className="mt-1">Your child is on track. Keep going.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(academicIntelligence.catchUpTasks ?? []).slice(0, 4).map((item) => (
                            <div key={item.taskId} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-white">{item.title}</p>
                                <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-xs font-bold text-cyan-200">{item.status.replaceAll("_", " ")}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-400">{item.subject}{item.topic ? ` • ${item.topic}` : ""}</p>
                              <p className="mt-1 text-slate-300">{academicIntelligence.catchUpRecommendations.find((row) => row.id === item.recommendationId)?.studentFriendlyReason ?? "Targeted recovery task."}</p>
                              <p className="mt-1 text-xs text-slate-400">Estimated time: {item.estimatedMinutes} mins</p>
                              <p className="mt-1 text-xs text-cyan-300">
                                {item.scheduledDay ? `${item.scheduledDay} plan` : "Schedule pending"}
                                {item.dueDate ? ` • Due ${new Date(item.dueDate).toLocaleDateString()}` : ""}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={academicActionTaskId === item.taskId}
                                  onClick={() => void handleAcademicTaskAction(item.taskId, "approve_catch_up")}
                                  className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200 disabled:opacity-60"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={academicActionTaskId === item.taskId}
                                  onClick={() => void handleAcademicTaskAction(item.taskId, "reschedule_catch_up")}
                                  className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-200 disabled:opacity-60"
                                >
                                  Reschedule
                                </button>
                                <button
                                  type="button"
                                  disabled={academicActionTaskId === item.taskId}
                                  onClick={() => void handleAcademicTaskAction(item.taskId, "waive_catch_up")}
                                  className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-200 disabled:opacity-60"
                                >
                                  Waive
                                </button>
                                <button
                                  type="button"
                                  disabled={academicActionTaskId === item.taskId}
                                  onClick={() => void handleAcademicTaskAction(item.taskId, "add_note")}
                                  className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-200 disabled:opacity-60"
                                >
                                  Add note
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                        <p className="font-semibold text-white">Assessment readiness</p>
                        <p className="mt-1">{academicIntelligence.assessmentReadiness.replaceAll("_", " ")}</p>
                        {academicIntelligence.gcseReadiness?.applicable ? (
                          <p className="mt-1 text-xs text-cyan-300">
                            GCSE: {academicIntelligence.gcseReadiness.readinessStatus.replaceAll("_", " ")} • {academicIntelligence.gcseReadiness.examBoard ?? "Exam board pending"} • {academicIntelligence.gcseReadiness.coverageGapCount} gaps
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-3 text-sm text-indigo-100">
                        <p className="font-semibold text-white">School Week Report</p>
                        <p className="mt-1 text-xs">
                          Catch-up completed: {(academicIntelligence.catchUpTasks ?? []).filter((task) => task.status === "completed").length} •
                          Homework completed: {(academicIntelligence.homeworkTasks ?? []).filter((task) => task.status === "completed").length} •
                          Overdue: {(academicIntelligence.catchUpTasks ?? []).filter((task) => task.status === "overdue").length + (academicIntelligence.homeworkTasks ?? []).filter((task) => task.status === "overdue").length}
                        </p>
                      </div>

                      {(academicIntelligence.homeworkTasks ?? []).length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">Homework tracking</p>
                          {(academicIntelligence.homeworkTasks ?? []).slice(0, 4).map((task) => (
                            <div key={task.taskId} className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-3 text-xs text-indigo-100">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-white">{task.title}</p>
                                <span className="rounded-full bg-indigo-400/20 px-2 py-0.5 font-bold">{task.status.replaceAll("_", " ")}</span>
                              </div>
                              <p className="mt-1">{task.subject ?? "General"}{task.topic ? ` • ${task.topic}` : ""} • {task.estimatedMinutes} mins</p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Review actions</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {academicIntelligence.reviewActions.map((action) => (
                            <button
                              key={action.action}
                              type="button"
                              disabled={!action.persistenceSupported}
                              title={action.message}
                              className={`rounded-lg border px-3 py-1 text-xs font-semibold ${action.persistenceSupported
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                                : "border-amber-400/30 bg-amber-400/10 text-amber-200 opacity-70"}`}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-amber-100/90">Persisted controls are now active for catch-up task workflow.</p>
                      </div>
                    </div>
                  )}
                </Panel>
              ) : null}
              
              {selectedChildId && insights ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel title="Focus areas" description={`Top ${Math.min(5, insights.weaknesses.length)} areas to work on`}>
                    {insights.weaknesses.length > 0 ? (
                      <div className="space-y-2">
                        {insights.weaknesses.slice(0, 5).map((weakness) => (
                          <div key={weakness.topic} className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                            <span className="text-slate-300">{weakness.topic}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-red-500" style={{ width: `${weakness.accuracy}%` }}></div>
                              </div>
                              <span className="w-12 text-right font-semibold text-red-400">{weakness.accuracy}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState text="No weak areas detected—great job!" />
                    )}
                  </Panel>
                  
                  <Panel title="Strengths" description={`Top ${Math.min(5, insights.strengths.length)} areas of strength`}>
                    {insights.strengths.length > 0 ? (
                      <div className="space-y-2">
                        {insights.strengths.slice(0, 5).map((strength) => (
                          <div key={strength.topic} className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                            <span className="text-slate-300">{strength.topic}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-green-500" style={{ width: `${strength.accuracy}%` }}></div>
                              </div>
                              <span className="w-12 text-right font-semibold text-green-400">{strength.accuracy}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState text="No strength data yet." />
                    )}
                  </Panel>
                </div>
              ) : null}
              
              {selectedChildId && insights ? (
                <Panel title="Learning summary" description="Overall progress and activity metrics">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Average accuracy" value={`${insights.averageAccuracy}%`} />
                    <Metric label="Total attempts" value={String(insights.totalAttempts)} />
                    <Metric label="Learning mode" value={insights.learningMode ?? "Standard"} />
                  </div>
                  <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Adaptive tutor</p>
                    {activeLearningDna?.enoughHistory ? (
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <Metric label="Status" value={activeLearningDna.readinessLabel ?? "Active"} />
                        <Metric label="Confidence trend" value={`${activeLearningDna.confidenceTrend ?? 0}%`} />
                        <Metric label="Best pace" value={activeLearningDna.preferredPace ?? "Balanced"} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-200">
                        {activeLearningDna?.fallbackMessage ?? "Not enough learning history yet. The tutor will adapt as more activities are completed."}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void downloadProgressReport("pdf")} disabled={reportDownloading}>
                      {reportDownloading ? "Preparing Report..." : "Download PDF Report"}
                    </Button>
                    <Button type="button" onClick={() => void downloadProgressReport("csv")} disabled={reportDownloading}>
                      {reportDownloading ? "Preparing Report..." : "Download CSV"}
                    </Button>
                    <Button type="button" onClick={() => void downloadProgressReport("excel")} disabled={reportDownloading}>
                      {reportDownloading ? "Preparing Report..." : "Download Excel"}
                    </Button>
                  </div>
                </Panel>
              ) : null}
              
              {selectedChildId && insights && insights.activity.length > 0 ? (
                <Panel title="30-day activity" description="Daily learning attempts over the past month">
                  <div className="space-y-3">
                    <div className="flex h-40 items-end gap-1">
                      {insights.activity.map((day) => {
                        const maxCount = Math.max(...insights.activity.map((d) => d.count), 1);
                        const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                        return (
                          <div key={day.date} className="flex-1" title={`${day.date}: ${day.count} attempts`}>
                            <div
                              className="w-full bg-gradient-to-t from-cyan-500 to-cyan-300 rounded-t-sm transition hover:opacity-80"
                              style={{ height: `${height}%`, minHeight: day.count > 0 ? "4px" : "0px" }}
                            ></div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{insights.activity[0]?.date}</span>
                      <span>{insights.activity[insights.activity.length - 1]?.date}</span>
                    </div>
                  </div>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {activeSection === "children" ? (
            <div className="space-y-6">
              {formVisible ? (
                <Panel title={effectiveEditingChildId ? "Edit child" : "Add new child"} description={effectiveEditingChildId ? "Update child details" : "Create a new child profile"}>
                  <ChildManagementForm
                    mode={effectiveEditingChildId ? "edit" : "add"}
                    initialData={effectiveEditingChildId ? (() => {
                      const child = children?.children.find(c => c.id === effectiveEditingChildId);
                      return child ? {
                        id: child.id,
                        name: child.name,
                        dateOfBirth: child.dateOfBirth ?? '',
                        schoolYear: child.schoolYear ?? child.yearGroup ?? '',
                        yearGroup: child.yearGroup ?? '',
                        keyStageLevel: child.keyStageLevel ?? '',
                        subjectLevel: child.subjectLevel ?? '',
                        selectedSubjects: child.selectedSubjects ?? ['english', 'maths'],
                        learningGoals: (child.learningGoals ?? []).join('\n').replace(/\\n/g, '\n'),
                        supportNeeds: child.senSupportNeeds ?? '',
                        ageYears: child.ageYears ?? '',
                        startLevelChoice: 'Beginner',
                        avatar: child.avatar || 'star',
                      } : undefined;
                    })() : undefined}
                    onSuccess={() => {
                      const wasEditing = effectiveEditingChildId !== null;
                      setShowChildForm(false);
                      setEditingChildId(null);
                      setChildFormMessage(wasEditing ? "Child profile updated." : "Child profile added successfully.");
                      if (modeAdd) {
                        router.replace("/parent/children");
                      }
                      void Promise.all([
                        fetch("/api/children", { credentials: "include" }).then(r => r.ok ? r.json() as Promise<ChildListResponse> : null),
                        fetch("/api/account", { credentials: "include" }).then(r => r.ok ? r.json() as Promise<AccountPayload> : null),
                      ]).then(([childrenData, accountData]) => {
                        if (childrenData) {
                          setChildren(childrenData);
                          setSelectedChildId(childrenData.activeChildId ?? childrenData.children[0]?.id ?? null);
                        }
                        if (accountData) {
                          setAccount(accountData);
                        }
                      }).catch(() => undefined);
                    }}
                    onCancel={() => {
                      if (modeAdd) {
                        router.replace("/parent/children");
                      }
                      setShowChildForm(false);
                      setEditingChildId(null);
                    }}
                  />
                </Panel>
              ) : (
                <Panel title="Children" description="Manage child profiles and choose the active profile.">
                  {childFormMessage ? (
                    <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-200">
                      {childFormMessage}
                    </p>
                  ) : null}
                  <div className="space-y-4">
                    <ChildPicker profiles={children?.children ?? []} selectedChildId={selectedChildId} setSelectedChildId={setSelectedChildId} />
                    <Button
                      onClick={() => {
                        setChildFormMessage(null);
                        setEditingChildId(null);
                        setShowChildForm(true);
                      }}
                      className="w-full bg-cyan-600 hover:bg-cyan-700"
                    >
                      + Add child
                    </Button>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {(children?.children ?? []).map((child) => (
                      <article key={child.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 group hover:bg-slate-900/90 transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 flex-1">
                            <ChildAvatar avatar={child.avatar} name={child.name} size="md" />
                            <div>
                              <p className="font-semibold text-white">{child.name}</p>
                              <p className="text-sm text-slate-400">{child.archived ? "Archived" : "Active"}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setEditingChildId(child.id);
                              setShowChildForm(true);
                            }}
                            className="text-xs text-cyan-400 hover:text-cyan-300 opacity-0 group-hover:opacity-100 transition"
                          >
                            Edit
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          ) : null}

          {activeSection === "billing" ? (
            <Panel title="Billing" description="Review your plan and upgrade path.">
              {subscription && account ? (
                <BillingCard
                  country={account.contact.country}
                  subscriptionProvider={subscription.subscription.provider}
                  currentPlanId={subscription.subscription.pricingPlanId}
                  planName={subscription.subscription.planName}
                  currentPricePence={subscription.subscription.currentPricePence}
                  currentCurrency={subscription.subscription.currentCurrency}
                  currentInterval={subscription.subscription.currentInterval}
                  status={subscription.subscription.status}
                  childrenUsed={subscription.subscription.childrenUsed}
                  childLimit={subscription.subscription.childLimit}
                  upgradeRequired={subscription.subscription.upgradeRequired}
                  reason={subscription.subscription.reason}
                  renewalDate={subscription.subscription.renewalDate}
                  trialEndsAt={subscription.subscription.trialEndsAt}
                  stripeCustomerId={account.account.stripeCustomerId}
                  plans={subscription.plans.map((plan) => ({
                    id: plan.id,
                    key: plan.key,
                    name: plan.name,
                    interval: plan.interval,
                    price: plan.price,
                    currency: plan.currency,
                    badge: plan.badge,
                    stripePriceId: plan.stripePriceId,
                    changeType: plan.changeType,
                  }))}
                />
              ) : (
                <EmptyState text="Loading billing information..." />
              )}
            </Panel>
          ) : null}

          {activeSection === "progress" ? (
            <>
              <Panel title="Progress" description="See the selected child's recent learning records.">
                <div className="mb-4 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void downloadProgressReport("pdf")} disabled={!selectedChildId || reportDownloading}>
                    {reportDownloading ? "Preparing Report..." : "Download PDF Report"}
                  </Button>
                  <Button type="button" onClick={() => void downloadProgressReport("csv")} disabled={!selectedChildId || reportDownloading}>
                    {reportDownloading ? "Preparing Report..." : "Download CSV"}
                  </Button>
                  <Button type="button" onClick={() => void downloadProgressReport("excel")} disabled={!selectedChildId || reportDownloading}>
                    {reportDownloading ? "Preparing Report..." : "Download Excel"}
                  </Button>
                </div>
                {childDetail ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {childDetail.progressRecords.slice(0, 6).map((record) => (
                      <Metric key={record.id} label={record.skill} value={`${record.level} • ${record.score}%`} />
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Choose a child to load recent progress." />
                )}
              </Panel>

              {childDetail && childDetail.progressRecords.length > 0 ? (
                <Panel title="Subject-skill breakdown" description="All skills organized by subject with accuracy scores">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-2 text-left font-semibold text-slate-300">Subject</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-300">Skill</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-300">Level</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-300">Accuracy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {childDetail.progressRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-white/5">
                            <td className="px-4 py-3 text-slate-400">{record.skill.split("_")[0] ?? "General"}</td>
                            <td className="px-4 py-3 text-slate-300">{record.skill}</td>
                            <td className="px-4 py-3 text-slate-300">{record.level}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={record.score >= 80 ? "text-green-400 font-semibold" : record.score >= 60 ? "text-yellow-400" : "text-red-400"}>
                                {record.score}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {activeSection === "tutor-history" ? (
            <Panel title="Tutor history" description="Recent level decisions and learning adjustments.">
              <div className="space-y-3">
                {(childDetail?.recentLevelDecisions ?? []).map((decision) => (
                  <div key={decision.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <p className="text-white">{decision.reason ?? "Auto level decision"}</p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(decision.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeSection === "rewards" ? (
            <>
              <Panel title="Rewards" description="Wallet balance and purchases for the selected child.">
                {childDetail ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Balance" value={currency(childDetail.walletSummary.balance)} />
                    <Metric label="Earned" value={currency(childDetail.walletSummary.earned)} />
                    <Metric label="Spent" value={currency(childDetail.walletSummary.spent)} />
                  </div>
                ) : (
                  <EmptyState text="Select a child to see rewards and wallet history." />
                )}
              </Panel>

              {childDetail && childDetail.purchaseHistory.some((p) => p.approvalStatus === "pending") ? (
                <Panel title="Pending approvals" description="Purchases awaiting admin review">
                  <div className="space-y-3">
                    {childDetail.purchaseHistory
                      .filter((p) => p.approvalStatus === "pending")
                      .map((purchase) => (
                        <div key={purchase.id} className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{purchase.itemName}</p>
                              <p className="mt-1 text-xs text-slate-400">{new Date(purchase.createdAt).toLocaleString()}</p>
                            </div>
                            <p className="font-semibold text-yellow-400">{currency(purchase.cost)}</p>
                          </div>
                          {purchase.reviewNote ? (
                            <p className="mt-2 text-xs text-yellow-300">Admin note: {purchase.reviewNote}</p>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {activeSection === "consent" ? (
            <ConsentAuditView
              accepted={consent?.accepted ?? false}
              version={consent?.version ?? null}
              acceptedAt={consent?.acceptedAt ?? null}
              withdrawnAt={consent?.withdrawnAt ?? null}
              auditHistory={consent?.auditHistory ?? []}
              onAccept={() => {
                fetch("/api/consent", { credentials: "include" })
                  .then(r => r.json())
                  .then(data => setConsent(data));
              }}
              onWithdraw={() => {
                fetch("/api/consent", { credentials: "include" })
                  .then(r => r.json())
                  .then(data => setConsent(data));
              }}
            />
          ) : null}

          {activeSection === "messages" ? (
            <div className="space-y-4">
              <Panel title="Message Support" description="Send a message to the StarLiz team. We'll reply within 1 business day.">
                <form
                  className="space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!composeBody.trim()) return;
                    setSendingMessage(true);
                    setMessageError(null);
                    try {
                      const res = await fetch("/api/parent/messages", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ subject: composeSubject || undefined, body: composeBody }),
                      });
                      if (!res.ok) {
                        const payload = await res.json().catch(() => null);
                        setMessageError((payload as { error?: string } | null)?.error ?? "Failed to send message.");
                        return;
                      }
                      setComposeSubject("");
                      setComposeBody("");
                      // Reload messages
                      const refreshed = await fetch("/api/parent/messages", { credentials: "include" });
                      if (refreshed.ok) {
                        const payload = (await refreshed.json()) as MessagesPayload;
                        setThreads(payload.threads ?? []);
                        setActiveThreadId(payload.selectedThreadId ?? null);
                        setThreadMessages(payload.messages ?? []);
                      }
                    } finally {
                      setSendingMessage(false);
                    }
                  }}
                >
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                    placeholder="Subject (optional)"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    maxLength={200}
                  />
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                    placeholder="Write your message..."
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    maxLength={2000}
                    required
                  />
                  {messageError ? <p className="text-sm text-red-400">{messageError}</p> : null}
                  <Button type="submit" disabled={sendingMessage || !composeBody.trim()}>
                    {sendingMessage ? "Sending..." : "Send Message"}
                  </Button>
                </form>
              </Panel>

              {threads.length > 0 ? (
                <Panel title="Conversation History" description="Your messages and replies from the StarLiz team.">
                  {threads.length > 1 ? (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {threads.map((t) => (
                        <button
                          key={t.id}
                          onClick={async () => {
                            setActiveThreadId(t.id);
                            const res = await fetch(`/api/parent/messages?threadId=${t.id}`, { credentials: "include" });
                            if (res.ok) {
                              const payload = (await res.json()) as MessagesPayload;
                              setThreadMessages(payload.messages ?? []);
                              setThreads(payload.threads ?? []);
                            }
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            t.id === activeThreadId ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-slate-300 hover:bg-white/20"
                          }`}
                        >
                          {t.contactLabel ?? t.contactAddress}
                          {t.parentUnreadCount > 0 ? (
                            <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                              {t.parentUnreadCount}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                    {threadMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-2xl p-3 text-sm ${
                          msg.direction === "inbound"
                            ? "ml-auto max-w-[80%] bg-cyan-600/20 text-slate-200"
                            : "mr-auto max-w-[80%] bg-white/8 text-slate-200"
                        }`}
                      >
                        <p className={`mb-1 text-xs font-semibold ${msg.direction === "inbound" ? "text-cyan-400" : "text-slate-400"}`}>
                          {msg.direction === "inbound" ? "You" : "StarLiz Support"}
                        </p>
                        <p className="whitespace-pre-line">{msg.body}</p>
                        <p className="mt-1 text-right text-xs text-slate-500">
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                    {!threadMessages.length ? <EmptyState text="No messages yet in this conversation." /> : null}
                  </div>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {activeSection === "support" ? (
            <Panel title="Support" description="Submit a ticket or review the latest ones.">
              <form className="space-y-3" onSubmit={submitSupport}>
                <input className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Subject" value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} />
                <textarea className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Describe the issue" value={supportBody} onChange={(event) => setSupportBody(event.target.value)} />
                <Button type="submit" disabled={saving}>Send support ticket</Button>
              </form>
              <div className="mt-6 space-y-3">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{ticket.subject}</p>
                      <p>{ticket.status}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Priority: {ticket.priority}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

        </div>

        <aside className="space-y-6">
          <Panel title="Quick facts" description="Current account and portal snapshot.">
            <div className="space-y-3 text-sm text-slate-300">
              <p>Name: <span className="font-semibold text-white">{account?.account.name ?? "Loading"}</span></p>
              <p>Email: <span className="font-semibold text-white">{account?.account.email ?? "Loading"}</span></p>
              <p>Children: <span className="font-semibold text-white">{account?.account.linkedChildrenCount ?? 0}</span></p>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">Active child:</span>
                {activeChild ? (
                  <span className="flex items-center gap-1.5">
                    <ChildAvatar avatar={activeChild.avatar} name={activeChild.name} size="sm" />
                    <span className="font-semibold text-white">{activeChild.name}</span>
                  </span>
                ) : (
                  <span className="font-semibold text-white">{account?.activeChild?.name ?? "None"}</span>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Navigation" description="Jump directly to the remaining portal areas.">
            <div className="grid gap-2">
              {sections.map((item) => (
                <Link
                  key={item.id}
                  href={sectionHref[item.id]}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${item.id === activeSection ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/30 sm:p-5 lg:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ChildPicker({ profiles, selectedChildId, setSelectedChildId }: { profiles: ChildListResponse["children"]; selectedChildId: string | null; setSelectedChildId: (value: string) => void; }) {
  if (!profiles.length) {
    return <EmptyState text="No child profiles are linked yet." />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {profiles.map((child) => (
        <button
          key={child.id}
          type="button"
          onClick={() => setSelectedChildId(child.id)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${selectedChildId === child.id ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:bg-white/10 hover:text-white"}`}
        >
          <ChildAvatar avatar={child.avatar} name={child.name} size="sm" />
          {child.name}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">{text}</p>;
}

function ChecklistItem({ index, title, href, cta, disabled = false, helpText }: { index: number; title: string; href: string; cta: string; disabled?: boolean; helpText?: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Step {index}</p>
      <h3 className="mt-2 text-base font-semibold text-white">{title}</h3>
      {disabled ? (
        <span className="mt-3 inline-flex cursor-not-allowed rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-300">
          {cta}
        </span>
      ) : (
        <Link href={href} className="mt-3 inline-flex rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
          {cta}
        </Link>
      )}
      {helpText ? <p className="mt-2 text-xs text-slate-400">{helpText}</p> : null}
    </article>
  );
}

const AVATAR_EMOJI: Record<string, string> = {
  star: '⭐', rocket: '🚀', owl: '🦉', lion: '🦁',
  unicorn: '🦄', robot: '🤖', book: '📚', rainbow: '🌈',
  dino: '🦕', cat: '🐱', dog: '🐶', dragon: '🐉',
};

const AVATAR_LEGACY_COLOR: Record<string, string> = {
  blue: 'from-sky-400 to-cyan-500',
  emerald: 'from-emerald-400 to-teal-500',
  rose: 'from-rose-400 to-orange-500',
  violet: 'from-violet-400 to-indigo-500',
};

function ChildAvatar({ avatar, name, size = 'md' }: { avatar: string | null | undefined; name: string; size?: 'sm' | 'md' }) {
  const key = avatar ?? '';
  const emoji = key in AVATAR_EMOJI ? AVATAR_EMOJI[key] : '';
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-sm' : 'h-9 w-9 text-xl';
  if (emoji) {
    return (
      <span
        className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-white/10 ${sizeClass}`}
        role="img"
        aria-label={key}
      >
        {emoji}
      </span>
    );
  }
  const colorClass = key in AVATAR_LEGACY_COLOR ? AVATAR_LEGACY_COLOR[key] : 'from-slate-400 to-slate-500';
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || 'ST';
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${colorClass} ${sizeClass} ${size === 'sm' ? 'text-[9px]' : 'text-xs'} font-black text-white`}
    >
      {initials}
    </span>
  );
}