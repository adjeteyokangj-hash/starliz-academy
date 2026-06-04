import type {
  AcademicIntelligenceOutput,
  CatchUpTaskRecord,
  HeartbeatPrimaryAction,
  HomeworkTaskRecord,
  MasteryMapEntry,
  RecommendationCanonicalDecision,
  RecommendationEngineSignal,
  RecommendationIntent,
  RecommendationMismatch,
  RecommendationSyncAudit,
  RecommendationTarget,
  SchoolWeekModeBlock,
} from "@/lib/academic-intelligence/types";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function targetLabel(target: RecommendationTarget): string {
  return target.label || target.topic || target.skill || target.subject || "general learning";
}

function targetFromParts(input: {
  subject?: string | null;
  topic?: string | null;
  skill?: string | null;
  fallback: string;
}): RecommendationTarget {
  const label = input.topic ?? input.skill ?? input.subject ?? input.fallback;
  return {
    subject: input.subject ?? null,
    topic: input.topic ?? null,
    skill: input.skill ?? null,
    label,
  };
}

function targetsConflict(left: RecommendationTarget, right: RecommendationTarget): boolean {
  const leftTopic = normalize(left.topic ?? left.skill ?? left.label);
  const rightTopic = normalize(right.topic ?? right.skill ?? right.label);
  const leftSubject = normalize(left.subject);
  const rightSubject = normalize(right.subject);

  if (!leftTopic || !rightTopic) return false;
  if (leftSubject && rightSubject && leftSubject !== rightSubject) return true;
  return leftTopic !== rightTopic;
}

function activeCatchUpStatus(status: string): boolean {
  return !["completed", "waived", "skipped"].includes(normalize(status));
}

function activeHomeworkStatus(status: string): boolean {
  return status === "assigned" || status === "in_progress" || status === "overdue";
}

function intentFromHeartbeat(action: HeartbeatPrimaryAction): RecommendationIntent {
  if (action === "review_placement") return "placement_review";
  if (action === "assign_catch_up" || action === "trigger_parent_alert" || action === "trigger_tutor_intervention") return "catch_up";
  if (action === "generate_revision" || action === "recommend_exam_preparation") return "revision";
  if (action === "schedule_homework") return "homework";
  if (action === "generate_assessment") return "assessment";
  if (action === "advance_student") return "advance";
  if (action === "maintain_level") return "maintain";
  return "unknown";
}

function intentFromBlock(block: SchoolWeekModeBlock | null): RecommendationIntent {
  if (!block) return "maintain";
  if (block.activityType === "catch_up") return "catch_up";
  if (block.activityType === "homework") return "homework";
  if (block.activityType === "quiz") return "assessment";
  if (block.activityType === "revision") return "revision";
  if (block.activityType === "subject") return "advance";
  return "maintain";
}

function canonicalFromOutput(output: AcademicIntelligenceOutput): RecommendationCanonicalDecision {
  const heartbeatIntent = intentFromHeartbeat(output.heartbeatDecision.primaryAction);
  const topCatchUp = output.catchUpRecommendations.find((item) => activeCatchUpStatus(item.status));
  const topMasteryGap = output.masteryMap.find((item) => item.masteryStatus === "needs_catch_up" || item.weakAreaActive);
  const topHomework = output.homeworkTasks.find((item) => activeHomeworkStatus(item.status));
  const topAssessment = output.assessmentRecommendations[0];
  const topAdvance = output.masteryMap.find((item) => item.masteryStatus === "nearly_secure" || item.masteryStatus === "mastered");

  if (heartbeatIntent === "catch_up" || topCatchUp || topMasteryGap) {
    const source = topCatchUp ?? topMasteryGap;
    return {
      intent: "catch_up",
      target: source
        ? targetFromParts({
            subject: source.subject,
            topic: source.topic,
            skill: source.skill,
            fallback: "priority catch-up",
          })
        : targetFromParts({ fallback: "priority catch-up" }),
      locked: true,
      lockReason: "Catch-up, weak-area, or HEART BEAT blocker is active.",
      sourceEngine: "heartbeat",
      action: `Lock next recommendation to ${source ? targetLabel(targetFromParts({
        subject: source.subject,
        topic: source.topic,
        skill: source.skill,
        fallback: "priority catch-up",
      })) : "priority catch-up"} until mastery improves.`,
    };
  }

  if (heartbeatIntent === "homework" && topHomework) {
    return {
      intent: "homework",
      target: targetFromParts({
        subject: topHomework.subject,
        topic: topHomework.topic,
        fallback: topHomework.title,
      }),
      locked: false,
      lockReason: null,
      sourceEngine: "heartbeat",
      action: `Prioritise homework: ${topHomework.title}.`,
    };
  }

  if (heartbeatIntent === "assessment" && topAssessment) {
    return {
      intent: "assessment",
      target: targetFromParts({
        subject: topAssessment.subject,
        topic: topAssessment.topic,
        skill: topAssessment.skill,
        fallback: topAssessment.subject,
      }),
      locked: false,
      lockReason: null,
      sourceEngine: "heartbeat",
      action: `Run assessment check for ${topAssessment.topic ?? topAssessment.subject}.`,
    };
  }

  if (heartbeatIntent === "advance" && topAdvance) {
    return {
      intent: "advance",
      target: targetFromParts({
        subject: topAdvance.subject,
        topic: topAdvance.topic,
        skill: topAdvance.skill,
        fallback: "next secure topic",
      }),
      locked: false,
      lockReason: null,
      sourceEngine: "heartbeat",
      action: `Advance after maintaining secure evidence for ${topAdvance.topic ?? topAdvance.skill ?? topAdvance.subject}.`,
    };
  }

  return {
    intent: heartbeatIntent,
    target: targetFromParts({ fallback: output.heartbeatDecision.suggestedNextStep || "current level" }),
    locked: heartbeatIntent === "placement_review",
    lockReason: heartbeatIntent === "placement_review" ? "Placement baseline is required before progression." : null,
    sourceEngine: "heartbeat",
    action: output.heartbeatDecision.suggestedNextStep,
  };
}

function topDailyBlock(output: AcademicIntelligenceOutput): SchoolWeekModeBlock | null {
  for (const schedule of output.schoolWeekModePlan.dailySchedules) {
    const priority = schedule.blocks.find((block) => block.recommendationId)
      ?? schedule.blocks.find((block) => block.activityType === "catch_up" || block.activityType === "quiz" || block.activityType === "homework" || block.activityType === "subject")
      ?? null;
    if (priority) return priority;
  }
  return null;
}

function signalStatus(input: {
  canonical: RecommendationCanonicalDecision;
  intent: RecommendationIntent;
  target: RecommendationTarget;
  informational?: boolean;
}): RecommendationEngineSignal["status"] {
  if (input.informational) return "informational";
  if (input.canonical.intent === "placement_review") {
    return input.intent === "placement_review" || input.intent === "maintain" ? "aligned" : "mismatch";
  }
  if (input.canonical.intent === "catch_up") {
    if (input.intent === "catch_up" || input.intent === "revision") {
      return targetsConflict(input.canonical.target, input.target) ? "mismatch" : "aligned";
    }
    if (input.intent === "homework" && !targetsConflict(input.canonical.target, input.target)) return "aligned";
    return input.intent === "maintain" ? "informational" : "mismatch";
  }
  if (input.canonical.intent === "advance" && input.intent === "assessment") return "aligned";
  if (input.intent !== input.canonical.intent) return "mismatch";
  return targetsConflict(input.canonical.target, input.target) ? "mismatch" : "aligned";
}

function buildSignal(input: Omit<RecommendationEngineSignal, "status"> & {
  canonical: RecommendationCanonicalDecision;
  informational?: boolean;
}): RecommendationEngineSignal {
  return {
    engine: input.engine,
    label: input.label,
    intent: input.intent,
    target: input.target,
    status: signalStatus({
      canonical: input.canonical,
      intent: input.intent,
      target: input.target,
      informational: input.informational,
    }),
    summary: input.summary,
    evidence: input.evidence,
  };
}

function catchUpSignal(output: AcademicIntelligenceOutput, canonical: RecommendationCanonicalDecision): RecommendationEngineSignal {
  const top = output.catchUpRecommendations.find((item) => activeCatchUpStatus(item.status));
  const target = top
    ? targetFromParts({ subject: top.subject, topic: top.topic, skill: top.skill, fallback: top.title })
    : targetFromParts({ fallback: "no active catch-up" });
  return buildSignal({
    canonical,
    engine: "catch_up",
    label: "Catch-Up",
    intent: top ? "catch_up" : "maintain",
    target,
    summary: top ? `Catch-up recommends ${targetLabel(target)}.` : "No active catch-up recommendation.",
    evidence: top ? [top.reason, `Status: ${top.status}`, `Priority: ${top.priority}`] : ["No unresolved catch-up task."],
    informational: !top,
  });
}

function dailyJourneySignal(output: AcademicIntelligenceOutput, canonical: RecommendationCanonicalDecision): RecommendationEngineSignal {
  const block = topDailyBlock(output);
  const target = block
    ? targetFromParts({ subject: block.subject, topic: block.topic, fallback: block.title })
    : targetFromParts({ fallback: "no daily plan" });
  return buildSignal({
    canonical,
    engine: "daily_journey",
    label: "Daily Journey",
    intent: intentFromBlock(block),
    target,
    summary: block ? `Daily plan starts with ${block.title}.` : "Daily plan has no active learning block.",
    evidence: block ? [`Activity: ${block.activityType}`, `Route: ${block.routeTarget ?? "-"}`] : ["No school-week block available."],
  });
}

function homeworkSignal(output: AcademicIntelligenceOutput, canonical: RecommendationCanonicalDecision): RecommendationEngineSignal {
  const top = output.homeworkTasks.find((item) => activeHomeworkStatus(item.status));
  const target = top
    ? targetFromParts({ subject: top.subject, topic: top.topic, fallback: top.title })
    : targetFromParts({ fallback: "no active homework" });
  return buildSignal({
    canonical,
    engine: "homework",
    label: "Homework",
    intent: top ? "homework" : "maintain",
    target,
    summary: top ? `Homework is set to ${top.title}.` : "No active homework task.",
    evidence: top ? [`Status: ${top.status}`, `Due: ${top.dueDate ?? "-"}`] : ["No assigned or overdue homework."],
    informational: !top,
  });
}

function assignmentSignal(output: AcademicIntelligenceOutput, canonical: RecommendationCanonicalDecision): RecommendationEngineSignal {
  const top = output.catchUpTasks.find((item: CatchUpTaskRecord) => activeCatchUpStatus(item.status));
  const target = top
    ? targetFromParts({ subject: top.subject, topic: top.topic, skill: top.skill, fallback: top.title })
    : targetFromParts({ fallback: "no active assignment task" });
  return buildSignal({
    canonical,
    engine: "assignments",
    label: "Assignments",
    intent: top ? "catch_up" : "maintain",
    target,
    summary: top ? `Assigned task follows ${top.title}.` : "No active catch-up assignment task.",
    evidence: top ? [`Status: ${top.status}`, `Recommendation: ${top.recommendationId}`] : ["No active catch-up task record."],
    informational: !top,
  });
}

function masterySignal(output: AcademicIntelligenceOutput, canonical: RecommendationCanonicalDecision): RecommendationEngineSignal {
  const priority = output.masteryMap.find((item: MasteryMapEntry) => item.masteryStatus === "needs_catch_up")
    ?? output.masteryMap.find((item) => item.masteryStatus === "needs_revision")
    ?? output.masteryMap.find((item) => item.masteryStatus === "nearly_secure" || item.masteryStatus === "mastered");
  const intent: RecommendationIntent = !priority
    ? "maintain"
    : priority.masteryStatus === "needs_catch_up"
      ? "catch_up"
      : priority.masteryStatus === "needs_revision"
        ? "revision"
        : "advance";
  const target = priority
    ? targetFromParts({ subject: priority.subject, topic: priority.topic, skill: priority.skill, fallback: priority.subject })
    : targetFromParts({ fallback: "no mastery evidence" });
  return buildSignal({
    canonical,
    engine: "mastery_map",
    label: "Mastery Map",
    intent,
    target,
    summary: priority ? `Mastery Map says ${targetLabel(target)} is ${priority.masteryStatus}.` : "Mastery Map has no topic evidence.",
    evidence: priority ? [`Confidence: ${priority.confidenceScore}%`, `Weak area active: ${priority.weakAreaActive ? "yes" : "no"}`] : ["No mastery rows available."],
  });
}

function certificateSignal(output: AcademicIntelligenceOutput, canonical: RecommendationCanonicalDecision): RecommendationEngineSignal {
  const blockers = output.summary.needsCatchUpCount + output.summary.needsRevisionCount;
  const overdueHomework = output.homeworkTasks.filter((item: HomeworkTaskRecord) => item.status === "overdue").length;
  const intent: RecommendationIntent = blockers > 0 || overdueHomework > 0 ? "catch_up" : "certificate";
  const target = blockers > 0
    ? targetFromParts({
        subject: output.masteryMap[0]?.subject,
        topic: output.masteryMap[0]?.topic,
        skill: output.masteryMap[0]?.skill,
        fallback: "certificate blockers",
      })
    : targetFromParts({ fallback: "certificate readiness" });
  return buildSignal({
    canonical,
    engine: "certificates",
    label: "Certificates",
    intent,
    target,
    summary: blockers > 0 || overdueHomework > 0
      ? "Certificate readiness is blocked by unresolved learning evidence."
      : "Certificate readiness has no catch-up blocker in Academic Intelligence.",
    evidence: [
      `Catch-up topics: ${output.summary.needsCatchUpCount}`,
      `Revision topics: ${output.summary.needsRevisionCount}`,
      `Overdue homework: ${overdueHomework}`,
    ],
    informational: intent === "certificate" && canonical.intent !== "certificate",
  });
}

function heartbeatSignal(output: AcademicIntelligenceOutput, canonical: RecommendationCanonicalDecision): RecommendationEngineSignal {
  return {
    engine: "heartbeat",
    label: "HEART BEAT",
    intent: intentFromHeartbeat(output.heartbeatDecision.primaryAction),
    target: canonical.target,
    status: "aligned",
    summary: `HEART BEAT recommends ${output.heartbeatDecision.primaryAction}.`,
    evidence: output.heartbeatDecision.evidence.slice(0, 4),
  };
}

function mismatchFromSignal(signal: RecommendationEngineSignal, canonical: RecommendationCanonicalDecision): RecommendationMismatch | null {
  if (signal.status !== "mismatch") return null;
  return {
    engine: signal.engine,
    label: signal.label,
    expected: `${canonical.intent}: ${targetLabel(canonical.target)}`,
    actual: `${signal.intent}: ${targetLabel(signal.target)}`,
    reason: signal.intent !== canonical.intent
      ? `${signal.label} is recommending a different action type.`
      : `${signal.label} is targeting a different topic or skill.`,
  };
}

export function buildRecommendationSyncAudit(output: AcademicIntelligenceOutput): RecommendationSyncAudit {
  const canonical = canonicalFromOutput(output);
  const signals = [
    heartbeatSignal(output, canonical),
    catchUpSignal(output, canonical),
    dailyJourneySignal(output, canonical),
    homeworkSignal(output, canonical),
    assignmentSignal(output, canonical),
    masterySignal(output, canonical),
    certificateSignal(output, canonical),
  ];
  const mismatches = signals
    .map((signal) => mismatchFromSignal(signal, canonical))
    .filter((item): item is RecommendationMismatch => Boolean(item));

  return {
    status: mismatches.length > 0 ? "warning" : "synced",
    canonicalDecision: canonical,
    signals,
    mismatches,
    action: mismatches.length > 0
      ? canonical.action
      : `Recommendation engines agree on ${canonical.intent}: ${targetLabel(canonical.target)}.`,
    generatedAt: output.generatedAt,
  };
}
