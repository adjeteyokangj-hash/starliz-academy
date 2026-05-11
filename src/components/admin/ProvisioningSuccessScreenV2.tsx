"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Zap, Clock, Activity, ChevronRight } from "lucide-react";

type ProvisioningStep = {
  id: string;
  label: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "error";
  estimatedSeconds: number;
};

type ReadinessWarning = {
  id: string;
  severity: "warning" | "critical";
  message: string;
  action?: string;
};

type OperationalRecommendation = {
  id: string;
  type: "info" | "priority" | "risk";
  message: string;
  timeframe?: string;
};

type ActivityFeedItem = {
  id: string;
  timestamp: string;
  action: string;
  status: "success" | "pending" | "info";
};

interface ProvisioningSuccessScreenV2Props {
  schoolName: string;
  schoolCode: string;
  licenceTier: string;
  onboardingPriority: string;
  region: string;
  targetLaunchDate?: string;
  safeguardingLead?: string;
  dslContact?: string;
  dataRetention?: string;
  regionComplianceProfile?: string;
  communicationPreference?: string;
  parentOnboardingMode?: string;
  retentionStrategy?: string;
  escalationChain?: string;
  safeguardingWorkflow?: string;
  approvalWorkflow?: string;
  operationalMode?: string;
  governanceStatus?: string;
  provisioningSteps: ProvisioningStep[];
  provisioningComplete: boolean;
  onCreateAnother: () => void;
  onViewSchool: () => void;
  onOpenWorkspace: () => void;
  onInviteAdmin: () => void;
  onConfigureSafeguarding: () => void;
  onViewGovernance: () => void;
  onLaunchStudentImport: () => void;
}

export default function ProvisioningSuccessScreenV2({
  schoolName,
  schoolCode,
  licenceTier,
  onboardingPriority,
  region,
  targetLaunchDate = "",
  safeguardingLead = "",
  dslContact = "",
  dataRetention = "",
  regionComplianceProfile = "",
  communicationPreference = "",
  parentOnboardingMode = "",
  retentionStrategy = "",
  escalationChain = "",
  safeguardingWorkflow = "",
  approvalWorkflow = "",
  operationalMode = "Standard",
  governanceStatus = "Pending Approval",
  provisioningSteps,
  provisioningComplete,
  onCreateAnother,
  onViewSchool,
  onOpenWorkspace,
  onInviteAdmin,
  onConfigureSafeguarding,
  onViewGovernance,
  onLaunchStudentImport,
}: ProvisioningSuccessScreenV2Props) {
  const [activityFeedStartedAt] = useState(() => Date.now());

  const regionComplianceLabel = {
    regional_baseline: "Regional Baseline",
    uk_dfe_enhanced: "UK DfE Enhanced",
    scotland_public_sector: "Scotland Public Sector",
    international_cross_border: "International Cross-Border",
  }[regionComplianceProfile] ?? "Not selected";

  const communicationPreferenceLabel = {
    email_only: "Email Only",
    email_sms: "Email + SMS Escalations",
    parent_app: "Parent App Primary",
    omnichannel: "Omnichannel Governance",
  }[communicationPreference] ?? "Not selected";

  const parentOnboardingModeLabel = {
    self_serve: "Self-Serve Invites",
    assisted_cohort: "Admin-Assisted Cohort",
    concierge: "Concierge Launch Support",
    hybrid_rollout: "Hybrid Phased Rollout",
  }[parentOnboardingMode] ?? "Not selected";

  const retentionStrategyLabel = {
    standard_3yr: "Standard (3-year)",
    extended_6yr: "Extended (6-year)",
    archive_quarterly: "Archive Quarterly",
    delete_annually: "Delete Annually",
  }[retentionStrategy] ?? "Not selected";

  const escalationChainLabel = {
    dsl_then_head: "DSL then Headteacher",
    safeguarding_team: "Safeguarding Team",
    multi_agency: "Multi-Agency Escalation",
    ceo_oversight: "CEO/Trust Oversight",
  }[escalationChain] ?? "Not selected";

  const safeguardingWorkflowLabel = {
    standard: "Standard Workflow",
    enhanced: "Enhanced Monitoring",
    critical: "Critical Incident Protocol",
    multi_agency: "Multi-Agency Protocol",
  }[safeguardingWorkflow] ?? "Not selected";

  const approvalWorkflowLabel = {
    headteacher_only: "Headteacher Only",
    dsl_and_head: "DSL & Headteacher",
    safeguarding_team: "Safeguarding Team",
    external_review: "External Review",
  }[approvalWorkflow] ?? "Not selected";

  // Calculate readiness warnings based on onboarding state
  const readinessWarnings = [
    !dslContact.trim()
      ? {
        id: "dsl-missing",
        severity: "warning",
        message: "No DSL assigned",
        action: "Configure Safeguarding",
      }
      : null,
    !targetLaunchDate.trim()
      ? {
        id: "launch-date",
        severity: "warning",
        message: "No launch date configured",
        action: "View School Settings",
      }
      : null,
    !safeguardingLead.trim()
      ? {
        id: "safeguarding-profile",
        severity: "warning",
        message: "Safeguarding lead still needs assignment",
        action: "Configure Safeguarding",
      }
      : null,
    !regionComplianceProfile.trim()
      ? {
        id: "region-compliance-missing",
        severity: "warning",
        message: "Region compliance profile not selected",
        action: "View Governance Dashboard",
      }
      : null,
    !communicationPreference.trim()
      ? {
        id: "communication-preferences-missing",
        severity: "warning",
        message: "Communication preferences not configured",
        action: "View Governance Dashboard",
      }
      : null,
    !parentOnboardingMode.trim()
      ? {
        id: "parent-onboarding-missing",
        severity: "warning",
        message: "Parent onboarding mode not configured",
        action: "View Governance Dashboard",
      }
      : null,
    !retentionStrategy.trim()
      ? {
        id: "retention-strategy-missing",
        severity: "warning",
        message: "Data retention strategy not configured",
        action: "View Governance Dashboard",
      }
      : null,
    !escalationChain.trim()
      ? {
        id: "escalation-chain-missing",
        severity: "critical",
        message: "Escalation chain not configured",
        action: "Configure Safeguarding",
      }
      : null,
    !safeguardingWorkflow.trim()
      ? {
        id: "safeguarding-workflow-missing",
        severity: "critical",
        message: "Safeguarding workflow profile not selected",
        action: "Configure Safeguarding",
      }
      : null,
    !approvalWorkflow.trim()
      ? {
        id: "approval-workflow-missing",
        severity: "warning",
        message: "Approval workflow process not configured",
        action: "View Governance Dashboard",
      }
      : null,
  ].filter(Boolean) as ReadinessWarning[];

  // AI-powered operational recommendations
  const operationalRecommendations = [
    {
      id: "onboarding-review",
      type: onboardingPriority === "critical" ? "risk" : "priority",
      message: onboardingPriority === "critical"
        ? "Executive onboarding review recommended within 24h"
        : "Recommend onboarding review within 48h",
      timeframe: onboardingPriority === "critical" ? "0-24h" : "24-48h",
    },
    !regionComplianceProfile.trim()
      ? {
        id: "governance-risk",
        type: "risk",
        message: "Apply a region compliance profile before launch",
        timeframe: "Immediate",
      }
      : regionComplianceProfile === "regional_baseline"
        ? {
          id: "governance-baseline-review",
          type: "priority",
          message: "Review whether baseline regional compliance is strong enough for this launch",
          timeframe: "Before Launch",
        }
        : {
          id: "governance-profile-active",
          type: "info",
          message: `${regionComplianceLabel} governance profile is ready for monitoring`,
          timeframe: "Live",
        },
    !parentOnboardingMode.trim()
      ? {
        id: "parent-onboarding",
        type: "info",
        message: "Parent onboarding not configured",
        timeframe: "Before Launch",
      }
      : {
        id: "parent-onboarding-ready",
        type: "info",
        message: `${parentOnboardingModeLabel} will steer parent activation`,
        timeframe: "Launch Week",
      },
    communicationPreference === "email_only"
      ? {
        id: "communication-resilience",
        type: "priority",
        message: "Consider adding SMS or app escalation to strengthen parent response coverage",
        timeframe: "Before Launch",
      }
      : null,
    !retentionStrategy.trim()
      ? {
        id: "retention-strategy-risk",
        type: "risk",
        message: "Define data retention strategy before launch",
        timeframe: "Immediate",
      }
      : retentionStrategy === "standard_3yr"
        ? {
          id: "retention-strategy-check",
          type: "info",
          message: "Standard 3-year retention schedule is active",
          timeframe: "Live",
        }
        : {
          id: "retention-strategy-active",
          type: "info",
          message: `${retentionStrategyLabel} retention policy is configured`,
          timeframe: "Live",
        },
    !escalationChain.trim()
      ? {
        id: "escalation-chain-critical",
        type: "risk",
        message: "Configure escalation routing for incidents before launch",
        timeframe: "Immediate",
      }
      : escalationChain === "dsl_then_head"
        ? {
          id: "escalation-strength-check",
          type: "priority",
          message: "Review escalation coverage for multi-agency coordination needs",
          timeframe: "Before Launch",
        }
        : {
          id: "escalation-chain-active",
          type: "info",
          message: `${escalationChainLabel} escalation routing is configured`,
          timeframe: "Live",
        },
    !safeguardingWorkflow.trim()
      ? {
        id: "safeguarding-workflow-critical",
        type: "risk",
        message: "Select safeguarding workflow profile before launch",
        timeframe: "Immediate",
      }
      : safeguardingWorkflow === "standard"
        ? {
          id: "safeguarding-workflow-check",
          type: "info",
          message: "Standard safeguarding workflow is active; monitor for enhancement needs",
          timeframe: "Post-Launch",
        }
        : {
          id: "safeguarding-workflow-active",
          type: "info",
          message: `${safeguardingWorkflowLabel} safeguarding protocol is configured`,
          timeframe: "Live",
        },
    !approvalWorkflow.trim()
      ? {
        id: "approval-workflow-risk",
        type: "priority",
        message: "Define approval workflows for incident resolution",
        timeframe: "Before Launch",
      }
      : {
        id: "approval-workflow-active",
        type: "info",
        message: `${approvalWorkflowLabel} approval process is active`,
        timeframe: "Live",
      },
  ].filter(Boolean) as OperationalRecommendation[];

  // Mock activity feed
  const activityFeed: ActivityFeedItem[] = [
    {
      id: "workspace-created",
      timestamp: new Date(activityFeedStartedAt - 2000).toLocaleTimeString(),
      action: "Workspace created",
      status: "success",
    },
    {
      id: "governance-applied",
      timestamp: new Date(activityFeedStartedAt - 1500).toLocaleTimeString(),
      action: "Governance profile applied",
      status: provisioningComplete ? "success" : "pending",
    },
    {
      id: "admin-role",
      timestamp: new Date(activityFeedStartedAt - 1000).toLocaleTimeString(),
      action: "Admin role generated",
      status: provisioningComplete ? "success" : "pending",
    },
    {
      id: "audit-tracking",
      timestamp: new Date(activityFeedStartedAt - 500).toLocaleTimeString(),
      action: "Audit tracking enabled",
      status: provisioningComplete ? "success" : "pending",
    },
  ];

  // Calculate launch readiness score (0-100)
  const calculateReadinessScore = () => {
    let score = 100;
    readinessWarnings.forEach((w) => {
      if (w.severity === "critical") score -= 20;
      else score -= 10;
    });
    return Math.max(0, score);
  };

  const readinessScore = calculateReadinessScore();
  const scoreColor =
    readinessScore >= 80
      ? "text-emerald-400"
      : readinessScore >= 60
        ? "text-amber-400"
        : "text-red-400";
  const scoreBgColor =
    readinessScore >= 80
      ? "bg-emerald-500/10"
      : readinessScore >= 60
        ? "bg-amber-500/10"
        : "bg-red-500/10";

  return (
    <div className="space-y-6">
      {/* 1. PROVISIONING TIMELINE */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Provisioning Timeline</h2>
        </div>

        {!provisioningComplete ? (
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4 mb-4">
            <p className="text-sm font-semibold text-indigo-100">🚀 Provisioning Your Workspace</p>
            <p className="mt-1 text-xs text-indigo-200/90">
              Setting up your operational environment. This typically takes 10-15 seconds.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 mb-4">
            <p className="text-sm font-semibold text-emerald-100">✓ Workspace Created Successfully</p>
            <p className="mt-1 text-xs text-emerald-200/90">
              {schoolName} is now live and ready for operations.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {provisioningSteps.map((step, idx) => {
            const isCompleted = step.status === "completed";
            const isInProgress = step.status === "in-progress";

            return (
              <div key={step.id}>
                <div
                  className={`rounded-lg border p-3 transition ${
                    isCompleted
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : isInProgress
                        ? "border-sky-500/40 bg-sky-500/10 animate-pulse"
                        : "border-slate-700/50 bg-slate-900/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p
                        className={`text-sm font-semibold ${
                          isCompleted
                            ? "text-emerald-100"
                            : isInProgress
                              ? "text-sky-100"
                              : "text-slate-300"
                        }`}
                      >
                        {isCompleted && "✓ "}
                        {isInProgress && "⏳ "}
                        {step.label}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{step.description}</p>
                    </div>
                    {isInProgress && (
                      <div className="flex gap-1">
                        <div className="h-2 w-2 rounded-full bg-sky-400 animate-bounce" />
                        <div className="h-2 w-2 rounded-full bg-sky-400 animate-bounce delay-100" />
                        <div className="h-2 w-2 rounded-full bg-sky-400 animate-bounce delay-200" />
                      </div>
                    )}
                  </div>
                </div>
                {idx < provisioningSteps.length - 1 && isCompleted && (
                  <div className="ml-5 h-2 border-l border-emerald-500/30" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {provisioningComplete && (
        <>
          {/* 2. SUCCESS SUMMARY CARD */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Provisioning Success Summary
              </h2>

              <div className="space-y-3">
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">School Name</p>
                  <p className="mt-1 text-sm font-semibold text-white">{schoolName}</p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">Generated School Code</p>
                  <p className="mt-1 text-lg font-mono font-semibold text-indigo-300">{schoolCode}</p>
                </div>

                <div className="grid gap-3 grid-cols-2">
                  <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Licence Tier</p>
                    <p className="mt-1 text-sm font-semibold text-sky-100">{licenceTier}</p>
                  </div>

                  <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Operational Mode</p>
                    <p className="mt-1 text-sm font-semibold text-purple-100">{operationalMode}</p>
                  </div>

                  <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Onboarding Priority</p>
                    <p className="mt-1 text-sm font-semibold text-amber-100">{onboardingPriority}</p>
                  </div>

                  <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Region</p>
                    <p className="mt-1 text-sm font-semibold text-violet-100">{region}</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div data-testid="pss-region-compliance" className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Region Compliance</p>
                    <p className="mt-1 text-sm font-semibold text-cyan-100">{regionComplianceLabel}</p>
                  </div>
                  <div data-testid="pss-communication-pref" className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Communication Preference</p>
                    <p className="mt-1 text-sm font-semibold text-fuchsia-100">{communicationPreferenceLabel}</p>
                  </div>
                  <div data-testid="pss-parent-mode" className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Parent Onboarding</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-100">{parentOnboardingModeLabel}</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div data-testid="pss-retention-strategy" className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Retention Strategy</p>
                    <p className="mt-1 text-sm font-semibold text-rose-100">{retentionStrategyLabel}</p>
                  </div>
                  <div data-testid="pss-escalation-chain" className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Escalation Chain</p>
                    <p className="mt-1 text-sm font-semibold text-orange-100">{escalationChainLabel}</p>
                  </div>
                  <div data-testid="pss-safeguarding-workflow" className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Safeguarding Workflow</p>
                    <p className="mt-1 text-sm font-semibold text-pink-100">{safeguardingWorkflowLabel}</p>
                  </div>
                  <div data-testid="pss-approval-workflow" className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-400">Approval Workflow</p>
                    <p className="mt-1 text-sm font-semibold text-yellow-100">{approvalWorkflowLabel}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">Data Retention</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{dataRetention || "Not set"}</p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">Governance Status</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                    <p className="text-sm font-semibold text-amber-100">{governanceStatus}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* LAUNCH READINESS SCORE */}
            <div className={`rounded-xl border p-6 ${scoreBgColor}`}>
              <h2 className="text-lg font-semibold text-white mb-4">Launch Readiness Score</h2>

              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div
                    className={`text-5xl font-bold ${scoreColor} font-mono`}
                  >
                    {readinessScore}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">/ 100</p>
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {readinessScore >= 80 ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : readinessScore >= 60 ? (
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    )}
                    <p className="text-sm font-semibold text-slate-300">
                      {readinessScore >= 80
                        ? "Ready to Launch"
                        : readinessScore >= 60
                          ? "Review Required"
                          : "Action Required"}
                    </p>
                  </div>

                  <p className="text-xs text-slate-400">
                    {readinessWarnings.length} item{readinessWarnings.length !== 1 ? "s" : ""} need{readinessWarnings.length !== 1 ? "" : "s"} attention
                  </p>

                  <div className="pt-2 border-t border-slate-700/50">
                    <p className="text-xs text-slate-500">
                      Complete all readiness checks to maximize operational success.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. IMMEDIATE ACTIONS */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Immediate Actions
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                onClick={onOpenWorkspace}
                className="group relative overflow-hidden rounded-lg border border-indigo-500/50 bg-indigo-500/10 p-4 text-left transition hover:border-indigo-500/80 hover:bg-indigo-500/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-indigo-100">Open School Workspace</p>
                    <p className="mt-1 text-xs text-slate-400">Access your fully configured school environment</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-indigo-400 transition group-hover:translate-x-1" />
                </div>
              </button>

              <button
                onClick={onInviteAdmin}
                className="group relative overflow-hidden rounded-lg border border-purple-500/50 bg-purple-500/10 p-4 text-left transition hover:border-purple-500/80 hover:bg-purple-500/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-purple-100">Invite Admin User</p>
                    <p className="mt-1 text-xs text-slate-400">Add team members with administrative rights</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-purple-400 transition group-hover:translate-x-1" />
                </div>
              </button>

              <button
                onClick={onConfigureSafeguarding}
                className="group relative overflow-hidden rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-left transition hover:border-red-500/80 hover:bg-red-500/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-red-100">Configure Safeguarding</p>
                    <p className="mt-1 text-xs text-slate-400">Set up safeguarding leads and risk profiles</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-red-400 transition group-hover:translate-x-1" />
                </div>
              </button>

              <button
                onClick={onViewGovernance}
                className="group relative overflow-hidden rounded-lg border border-cyan-500/50 bg-cyan-500/10 p-4 text-left transition hover:border-cyan-500/80 hover:bg-cyan-500/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-cyan-100">View Governance Dashboard</p>
                    <p className="mt-1 text-xs text-slate-400">Monitor compliance and governance status</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-cyan-400 transition group-hover:translate-x-1" />
                </div>
              </button>

              <button
                onClick={onLaunchStudentImport}
                className="group relative overflow-hidden rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 text-left transition hover:border-emerald-500/80 hover:bg-emerald-500/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-emerald-100">Launch Student Import</p>
                    <p className="mt-1 text-xs text-slate-400">Begin importing student data and classrooms</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-emerald-400 transition group-hover:translate-x-1" />
                </div>
              </button>

              <button
                onClick={onViewSchool}
                className="group relative overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900/50 p-4 text-left transition hover:border-slate-600/50 hover:bg-slate-800/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-100">View Full School Details</p>
                    <p className="mt-1 text-xs text-slate-400">Access complete school management interface</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 transition group-hover:translate-x-1" />
                </div>
              </button>
            </div>
          </div>

          {/* 4. READINESS WARNINGS */}
          {readinessWarnings.length > 0 && (
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Readiness Warnings
              </h2>

              <div className="space-y-2">
                {readinessWarnings.map((warning) => (
                  <div
                    key={warning.id}
                    data-testid={`pss-warning-${warning.id}`}
                    className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${
                      warning.severity === "critical"
                        ? "border-red-500/40 bg-red-500/10"
                        : "border-amber-500/40 bg-amber-500/10"
                    }`}
                  >
                    <div className="flex-1">
                      <p
                        className={`text-sm font-semibold ${
                          warning.severity === "critical"
                            ? "text-red-100"
                            : "text-amber-100"
                        }`}
                      >
                        {warning.message}
                      </p>
                    </div>
                    {warning.action && (
                      <button className="text-xs font-semibold px-3 py-1 rounded bg-slate-800/50 text-slate-200 hover:bg-slate-700/50 whitespace-nowrap">
                        {warning.action}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. AI OPERATIONAL RECOMMENDATIONS */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-400" />
              AI Operational Recommendations
            </h2>

            <div className="space-y-3">
              {operationalRecommendations.map((rec) => {
                const bgColor =
                  rec.type === "priority"
                    ? "border-sky-500/40 bg-sky-500/10"
                    : rec.type === "risk"
                      ? "border-red-500/40 bg-red-500/10"
                      : "border-slate-700/40 bg-slate-800/20";

                const textColor =
                  rec.type === "priority"
                    ? "text-sky-100"
                    : rec.type === "risk"
                      ? "text-red-100"
                      : "text-slate-200";

                const timeframeColor =
                  rec.type === "priority"
                    ? "text-sky-300"
                    : rec.type === "risk"
                      ? "text-red-300"
                      : "text-slate-400";

                return (
                  <div
                    key={rec.id}
                    data-testid={`pss-rec-${rec.id}`}
                    className={`rounded-lg border p-3 ${bgColor}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${textColor}`}>
                          {rec.message}
                        </p>
                      </div>
                      {rec.timeframe && (
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${timeframeColor} bg-slate-900/40`}>
                          {rec.timeframe}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 6. PROVISIONING ACTIVITY FEED */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-slate-400" />
              Provisioning Activity Feed
            </h2>

            <div className="space-y-3">
              {activityFeed.map((item, idx) => (
                <div key={item.id} className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`rounded-full p-2 ${
                        item.status === "success"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : item.status === "pending"
                            ? "bg-sky-500/20 text-sky-400 animate-pulse"
                            : "bg-slate-700/50 text-slate-400"
                      }`}
                    >
                      {item.status === "success" ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : item.status === "pending" ? (
                        <Clock className="w-4 h-4" />
                      ) : (
                        <Activity className="w-4 h-4" />
                      )}
                    </div>
                    {idx < activityFeed.length - 1 && (
                      <div className="h-8 w-0.5 bg-slate-700/30 mt-2" />
                    )}
                  </div>

                  <div className="flex-1 pb-3">
                    <p className="text-sm font-semibold text-slate-200">
                      {item.action}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{item.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-wrap gap-3 pt-4">
            <button
              onClick={onCreateAnother}
              className="px-6 py-2 rounded-lg font-semibold border border-slate-700/50 bg-slate-900/50 text-slate-100 hover:border-slate-600/50 hover:bg-slate-800/50 transition"
            >
              Create Another School
            </button>
            <button
              onClick={onViewSchool}
              className="px-6 py-2 rounded-lg font-semibold border border-indigo-500/50 bg-indigo-500/20 text-indigo-100 hover:border-indigo-500/80 hover:bg-indigo-500/30 transition"
            >
              Return to Schools List
            </button>
          </div>
        </>
      )}
    </div>
  );
}
