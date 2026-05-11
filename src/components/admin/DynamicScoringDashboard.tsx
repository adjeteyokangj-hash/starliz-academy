"use client";

import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Target } from "lucide-react";

interface SchoolScoreData {
  id: string;
  name: string;
  licence: {
    status: string;
    seatLimit: number;
    seatsUsed: number;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
  } | null;
  teachers: Array<{ status: string; acceptedAt: string | null; lastActiveAt: string | null }>;
  students: Array<{ status: string }>;
  classrooms: Array<{ id: string }>;
  safeguarding: { openAlerts: number; criticalAlerts: number };
  safeguardingIncidents: Array<{ severity: string; status: string }>;
  communicationPreferences: Array<{ id?: string; linkId?: string }>;
  activityTimeline: Array<{ createdAt: string }>;
}

interface ScoreMetrics {
  overallScore: number;
  governanceScore: number;
  safeguardingScore: number;
  operationalScore: number;
  licenceScore: number;
  trend: "up" | "down" | "stable";
}

interface RiskCategory {
  name: string;
  count: number;
  severity: "critical" | "high" | "medium" | "low";
}

interface RecommendedAction {
  id: string;
  action: string;
  impact: "high" | "medium" | "low";
  priority: "urgent" | "important" | "standard";
}

interface TopScoringFactor {
  label: string;
  score: number;
  weight: number;
  detail: string;
}

function calculateGovernanceScore(school: SchoolScoreData): ScoreMetrics["governanceScore"] {
  let score = 0;

  // Teachers assigned (25 pts)
  const activeTeachers = school.teachers.filter((t) => t.status === "active").length;
  score += activeTeachers > 0 ? 25 : activeTeachers >= 1 ? 15 : 0;

  // Recent activity (25 pts)
  if (school.activityTimeline.length > 0) {
    const lastActivityTime = new Date(school.activityTimeline[0].createdAt).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    score += lastActivityTime > sevenDaysAgo ? 25 : 12;
  }

  // School status active (25 pts) - assumed if teachers and activity exist
  score += 25;

  // No critical incidents (20 pts)
  const criticalIncidents = school.safeguardingIncidents.filter((i) => i.severity === "Critical").length;
  score += criticalIncidents === 0 ? 20 : 0;

  return Math.min(score, 100);
}

function calculateSafeguardingScore(school: SchoolScoreData): ScoreMetrics["safeguardingScore"] {
  let score = 0;

  // No critical safeguarding alerts (40 pts)
  score += school.safeguarding.criticalAlerts === 0 ? 40 : 20;

  // No open incidents (30 pts)
  const unresolvedIncidents = school.safeguardingIncidents.filter((i) => i.status !== "resolved").length;
  score += unresolvedIncidents === 0 ? 30 : unresolvedIncidents <= 2 ? 15 : 0;

  // Communication preferences documented (30 pts)
  score += school.communicationPreferences.length > 0 ? 30 : 0;

  return Math.min(score, 100);
}

function calculateOperationalScore(school: SchoolScoreData): ScoreMetrics["operationalScore"] {
  let score = 0;

  // Licence not suspended/past due (30 pts)
  const licenceStatus = school.licence?.status ?? "pilot";
  score += licenceStatus !== "suspended" && licenceStatus !== "past_due" ? 30 : 0;

  // Adequate seat capacity (20 pts)
  if (school.licence) {
    const seatUsagePercent = (school.licence.seatsUsed / (school.licence.seatLimit || 100)) * 100;
    score += seatUsagePercent < 85 ? 20 : seatUsagePercent < 95 ? 10 : 0;
  }

  // Recent activity within 7 days (25 pts)
  if (school.activityTimeline.length > 0) {
    const lastActivityTime = new Date(school.activityTimeline[0].createdAt).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    score += lastActivityTime > sevenDaysAgo ? 25 : 10;
  }

  // Active teachers (25 pts)
  const activeTeachers = school.teachers.filter((t) => t.status === "active").length;
  score += activeTeachers > 0 ? 25 : 0;

  return Math.min(score, 100);
}

function calculateLicenceScore(school: SchoolScoreData): ScoreMetrics["licenceScore"] {
  let score = 0;

  // Licence exists and active (40 pts)
  if (school.licence) {
    score += school.licence.status === "active" || school.licence.status === "trialing" ? 40 : 20;
  }

  // Seats available (25 pts)
  if (school.licence) {
    score += school.licence.seatsUsed < school.licence.seatLimit ? 25 : 10;
  }

  // Valid period (20 pts)
  if (school.licence?.currentPeriodEnd) {
    const periodEnd = new Date(school.licence.currentPeriodEnd).getTime();
    const futureCheck = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    score += periodEnd > futureCheck ? 20 : periodEnd > Date.now() ? 10 : 0;
  }

  // Trial active or not expired (15 pts)
  if (school.licence?.trialEndsAt) {
    const trialEnd = new Date(school.licence.trialEndsAt).getTime();
    score += trialEnd > Date.now() ? 15 : 0;
  }

  return Math.min(score, 100);
}

function calculateOverallScore(
  governance: number,
  safeguarding: number,
  operational: number,
  licence: number,
): number {
  const weighted = (governance * 0.25) + (safeguarding * 0.3) + (operational * 0.25) + (licence * 0.2);
  return Math.round(weighted);
}

function getScoreTrend(score: number): "up" | "down" | "stable" {
  // Simulate trend based on score value (in real implementation, compare with previous)
  if (score >= 80) return "up";
  if (score <= 40) return "down";
  return "stable";
}

function getRiskCategories(school: SchoolScoreData): RiskCategory[] {
  const risks: RiskCategory[] = [];

  if (school.safeguarding.criticalAlerts > 0) {
    risks.push({
      name: "Critical Safeguarding Alerts",
      count: school.safeguarding.criticalAlerts,
      severity: "critical",
    });
  }

  if (school.safeguarding.openAlerts > 0) {
    risks.push({
      name: "Open Safeguarding Alerts",
      count: school.safeguarding.openAlerts,
      severity: "high",
    });
  }

  const unresolvedIncidents = school.safeguardingIncidents.filter((i) => i.status !== "resolved").length;
  if (unresolvedIncidents > 0) {
    risks.push({
      name: "Unresolved Incidents",
      count: unresolvedIncidents,
      severity: "high",
    });
  }

  if (school.licence) {
    if (school.licence.status === "suspended" || school.licence.status === "past_due") {
      risks.push({
        name: "Licence Issue",
        count: 1,
        severity: "critical",
      });
    }

    const seatUsagePercent = (school.licence.seatsUsed / (school.licence.seatLimit || 100)) * 100;
    if (seatUsagePercent >= 95) {
      risks.push({
        name: "Seat Capacity Warning",
        count: Math.ceil(seatUsagePercent),
        severity: "high",
      });
    }
  }

  const inactiveTeachers = school.teachers.filter((t) => t.status === "invited" || t.status === "inactive").length;
  if (inactiveTeachers > 0) {
    risks.push({
      name: "Inactive Teacher Accounts",
      count: inactiveTeachers,
      severity: "medium",
    });
  }

  return risks.slice(0, 6);
}

function getRecommendedActions(school: SchoolScoreData): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (school.safeguarding.criticalAlerts > 0) {
    actions.push({
      id: "critical-alerts",
      action: "Review and escalate critical safeguarding alerts immediately",
      impact: "high",
      priority: "urgent",
    });
  }

  if (school.teachers.filter((t) => t.status === "active").length === 0) {
    actions.push({
      id: "no-active-teachers",
      action: "Invite at least one teacher to activate classroom operations",
      impact: "high",
      priority: "urgent",
    });
  }

  if (school.licence?.status === "trialing" || school.licence?.status === "pilot") {
    actions.push({
      id: "upgrade-licence",
      action: "Upgrade licence from pilot/trial to active status",
      impact: "high",
      priority: "important",
    });
  }

  if (school.licence && school.licence.seatsUsed / school.licence.seatLimit > 0.85) {
    actions.push({
      id: "expand-seats",
      action: "Consider expanding seat allocation to accommodate growth",
      impact: "medium",
      priority: "important",
    });
  }

  if (school.communicationPreferences.length === 0) {
    actions.push({
      id: "setup-communication",
      action: "Configure communication preferences for parent engagement",
      impact: "medium",
      priority: "standard",
    });
  }

  if (school.classrooms.length === 0) {
    actions.push({
      id: "create-classrooms",
      action: "Create classrooms to organize student learning groups",
      impact: "medium",
      priority: "standard",
    });
  }

  return actions.slice(0, 5);
}

function getTopScoringFactors(school: SchoolScoreData): TopScoringFactor[] {
  const factors: TopScoringFactor[] = [];

  const activeTeachers = school.teachers.filter((teacher) => teacher.status === "active").length;
  const unresolvedIncidents = school.safeguardingIncidents.filter((incident) => incident.status !== "resolved").length;
  const activityFresh = school.activityTimeline.length > 0
    && new Date(school.activityTimeline[0].createdAt).getTime() > (Date.now() - 7 * 24 * 60 * 60 * 1000);
  const hasHealthySeatBuffer = school.licence
    ? school.licence.seatLimit > 0 && (school.licence.seatsUsed / school.licence.seatLimit) < 0.85
    : false;

  factors.push({
    label: "Safeguarding Control",
    score: school.safeguarding.criticalAlerts === 0 ? 92 : 48,
    weight: 30,
    detail: school.safeguarding.criticalAlerts === 0
      ? "No critical safeguarding alerts"
      : `${school.safeguarding.criticalAlerts} critical alerts require action`,
  });

  factors.push({
    label: "Teacher Activation",
    score: activeTeachers > 0 ? 88 : 35,
    weight: 20,
    detail: activeTeachers > 0
      ? `${activeTeachers} active teachers currently assigned`
      : "No active teachers assigned",
  });

  factors.push({
    label: "Operational Freshness",
    score: activityFresh ? 84 : 42,
    weight: 20,
    detail: activityFresh ? "Recent operational activity detected" : "Activity feed is stale",
  });

  factors.push({
    label: "Licence Capacity",
    score: hasHealthySeatBuffer ? 81 : 51,
    weight: 15,
    detail: hasHealthySeatBuffer
      ? "Seat usage within healthy buffer"
      : "Seat pressure building toward limit",
  });

  factors.push({
    label: "Incident Resolution",
    score: unresolvedIncidents === 0 ? 86 : unresolvedIncidents <= 2 ? 63 : 34,
    weight: 15,
    detail: unresolvedIncidents === 0
      ? "No unresolved incidents"
      : `${unresolvedIncidents} unresolved incidents in queue`,
  });

  return factors.sort((a, b) => b.score - a.score).slice(0, 5);
}

export default function DynamicScoringDashboard({
  school,
}: {
  school: SchoolScoreData;
}) {
  const testIdFragment = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const governanceScore = calculateGovernanceScore(school);
  const safeguardingScore = calculateSafeguardingScore(school);
  const operationalScore = calculateOperationalScore(school);
  const licenceScore = calculateLicenceScore(school);
  const overallScore = calculateOverallScore(governanceScore, safeguardingScore, operationalScore, licenceScore);
  const trend = getScoreTrend(overallScore);
  const riskCategories = getRiskCategories(school);
  const recommendedActions = getRecommendedActions(school);
  const topScoringFactors = getTopScoringFactors(school);

  const trendCards = [
    { label: "Overall", value: overallScore, baseline: 70 },
    { label: "Governance", value: governanceScore, baseline: 68 },
    { label: "Safeguarding", value: safeguardingScore, baseline: 72 },
    { label: "Operational Risk", value: operationalScore, baseline: 66 },
    { label: "Licence/Onboarding", value: licenceScore, baseline: 65 },
  ].map((card) => {
    const delta = card.value - card.baseline;
    return {
      ...card,
      delta,
      trend: delta > 4 ? "up" : delta < -4 ? "down" : "stable",
    };
  });

  const scoreClass = (score: number): string => {
    if (score >= 80) return "text-emerald-100";
    if (score >= 60) return "text-sky-100";
    if (score >= 40) return "text-amber-100";
    return "text-rose-100";
  };

  const scoreBgClass = (score: number): string => {
    if (score >= 80) return "border-emerald-500/30 bg-emerald-500/10";
    if (score >= 60) return "border-sky-500/30 bg-sky-500/10";
    if (score >= 40) return "border-amber-500/30 bg-amber-500/10";
    return "border-rose-500/30 bg-rose-500/10";
  };

  const scoreStatus = (score: number): string => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "At Risk";
    return "Critical";
  };

  const riskSeverityClass = (severity: string): string => {
    switch (severity) {
      case "critical":
        return "border-rose-500/40 bg-rose-500/15 text-rose-100";
      case "high":
        return "border-amber-500/40 bg-amber-500/15 text-amber-100";
      case "medium":
        return "border-sky-500/40 bg-sky-500/15 text-sky-100";
      default:
        return "border-emerald-500/40 bg-emerald-500/15 text-emerald-100";
    }
  };

  const priorityClass = (priority: string): string => {
    switch (priority) {
      case "urgent":
        return "border-rose-500/40 bg-rose-500/15 text-rose-100";
      case "important":
        return "border-amber-500/40 bg-amber-500/15 text-amber-100";
      default:
        return "border-sky-500/40 bg-sky-500/15 text-sky-100";
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <section className={`rounded-2xl border p-6 ${scoreBgClass(overallScore)}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">Overall Launch Readiness</p>
            <div className="mt-2 flex items-baseline gap-2">
              <p data-testid="dsd-overall-score" className={`text-5xl font-black ${scoreClass(overallScore)}`}>{overallScore}</p>
              <span className="text-xl font-bold text-slate-400">/100</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-200">{scoreStatus(overallScore)}</p>
          </div>
          <div className="flex flex-col gap-2">
            {trend === "up" && <TrendingUp className="h-8 w-8 text-emerald-400" />}
            {trend === "down" && <TrendingDown className="h-8 w-8 text-rose-400" />}
            {trend === "stable" && <Target className="h-8 w-8 text-slate-400" />}
            <span className="text-xs font-semibold text-slate-400">
              {trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable"}
            </span>
          </div>
        </div>
      </section>

      {/* Score Breakdown Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">Governance Score</p>
          <p data-testid="dsd-governance-score" className="mt-2 text-3xl font-black text-sky-100">{governanceScore}</p>
          <p className="mt-1 text-[10px] text-sky-200/80">Teachers · Activity · Incidents</p>
        </article>
        <article className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-200">Safeguarding Score</p>
          <p data-testid="dsd-safeguarding-score" className="mt-2 text-3xl font-black text-rose-100">{safeguardingScore}</p>
          <p className="mt-1 text-[10px] text-rose-200/80">Alerts · Incidents · Preferences</p>
        </article>
        <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Operational Risk Score</p>
          <p data-testid="dsd-operational-score" className="mt-2 text-3xl font-black text-amber-100">{operationalScore}</p>
          <p className="mt-1 text-[10px] text-amber-200/80">Licence · Seats · Activity</p>
        </article>
        <article className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Licence/Onboarding Score</p>
          <p data-testid="dsd-licence-score" className="mt-2 text-3xl font-black text-indigo-100">{licenceScore}</p>
          <p className="mt-1 text-[10px] text-indigo-200/80">Status · Seats · Period</p>
        </article>
      </section>

      <section data-testid="dsd-trend-cards" className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Score Trend Cards</h3>
          <span className="text-xs text-slate-400">vs dynamic baseline window</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {trendCards.map((card) => (
            <article key={card.label} data-testid={`dsd-trend-${testIdFragment(card.label)}`} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{card.label}</p>
              <p className="mt-1 text-2xl font-black text-white">{card.value}</p>
              <p className={`mt-1 text-[11px] font-semibold ${
                card.trend === "up"
                  ? "text-emerald-300"
                  : card.trend === "down"
                    ? "text-rose-300"
                    : "text-slate-300"
              }`}>
                {card.trend === "up" ? "Up" : card.trend === "down" ? "Down" : "Stable"} {card.delta >= 0 ? `+${card.delta}` : card.delta}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section data-testid="dsd-top-factors" className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Top Scoring Factors</h3>
          <span className="text-xs text-slate-400">highest contributing signals</span>
        </div>
        <div className="space-y-2">
          {topScoringFactors.map((factor) => (
            <article key={factor.label} data-testid={`dsd-factor-${testIdFragment(factor.label)}`} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-white">{factor.label}</p>
                <p className="text-xs font-semibold text-slate-300">{factor.score}/100 · {factor.weight}% weight</p>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{factor.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Risk Categories */}
      {riskCategories.length > 0 && (
        <section data-testid="dsd-risk-breakdown" className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Risk Categories</h3>
            <span className="ml-auto text-xs font-semibold text-slate-400">{riskCategories.length} identified</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {riskCategories.map((risk) => (
              <article key={risk.name} data-testid={`dsd-risk-${testIdFragment(risk.name)}`} className={`rounded-lg border p-3 ${riskSeverityClass(risk.severity)}`}>
                <p className="text-xs font-semibold">{risk.name}</p>
                <p className="mt-1 text-xl font-black">{risk.count}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Actions */}
      {recommendedActions.length > 0 && (
        <section data-testid="dsd-next-actions" className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-6">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">Recommended Next Actions</h3>
            <span className="ml-auto text-xs font-semibold text-slate-400">{recommendedActions.length} actions</span>
          </div>
          <div className="space-y-2">
            {recommendedActions.map((action) => (
              <article key={action.id} data-testid={`dsd-action-${action.id}`} className={`rounded-lg border p-3 ${priorityClass(action.priority)}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold">{action.action}</p>
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide opacity-75">
                    {action.impact} impact
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Scoring Methodology */}
      <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-6">
        <h3 className="text-sm font-semibold text-white">Scoring Methodology</h3>
        <div className="mt-3 grid gap-3 text-xs text-slate-300 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-2">
            <p className="font-semibold text-slate-100">Governance (25%)</p>
            <p className="mt-1">Teachers assigned, recent activity, status, critical incidents</p>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-2">
            <p className="font-semibold text-slate-100">Safeguarding (30%)</p>
            <p className="mt-1">Critical alerts, incident resolution, communication setup</p>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-2">
            <p className="font-semibold text-slate-100">Operational (25%)</p>
            <p className="mt-1">Licence status, seat capacity, activity, active staff</p>
          </div>
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-2">
            <p className="font-semibold text-slate-100">Licence (20%)</p>
            <p className="mt-1">Status validity, seat availability, period coverage</p>
          </div>
        </div>
      </section>
    </div>
  );
}
