import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { ageGroupForYearGroup, curriculumPathwayForYearGroup, keyStageForYearGroup, normalizeSubject, normalizeYearGroup, yearGroupToOrdinal, type Subject } from "@/lib/curriculum";
import { getProgressionDecisionBrainView } from "@/lib/student-learning-brain";
import { buildUniversalPrefillContract, type UniversalAiPrefillContract } from "@/lib/ai-prefill-contract";

type Context = { params: Promise<{ id: string }> };

const applySchema = z.object({
  scopedSubject: z.string().min(1),
  recommendedLevel: z.number().int().min(1).max(6).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  reasons: z.array(z.string()).optional(),
  action: z.enum(["apply", "revert"]).optional(),
});

type SubjectLevelOverride = {
  level: number;
  appliedAt: string;
  appliedBy: string;
  confidence?: number;
  reasons?: string[];
};

type AiGenerationTarget = {
  scopedSubject: string;
  subject: Subject;
  strand: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  studentYearGroup: string | null;
  studentKeyStage: string | null;
  targetLearningYearGroup: string | null;
  targetLearningKeyStage: string | null;
  subjectLevel: number | null;
  strandLevel: number | null;
  levelSource: "qlf" | "progression" | "mastery" | "admin_override" | "fallback";
  skillFocus: string;
  difficulty: number;
  accuracy: number;
  reason: string;
  prefillContract: UniversalAiPrefillContract;
};

type AutoPromotionCycleState = {
  lastCandidateSignature: string | null;
  candidateStreak: number;
  lastEvaluatedAt: string;
};

type AutoPromotionHistoryEntry = {
  promotedAt: string;
  promotedToLevel: number;
  confidence: number;
  reason: string;
  evidenceSnapshot: {
    status: string;
    action: string;
    currentLevel: number;
    recommendedLevel: number;
    confidence: number;
    activityCount: number;
    completedAssignments: number;
    attemptCount: number;
    averageScore: number;
    activeWeakAreas: number;
    masterySignals: number;
  };
};

type AutoPromotionState = {
  cyclesByScope: Record<string, AutoPromotionCycleState>;
  historyByScope: Record<string, AutoPromotionHistoryEntry[]>;
};

type AutoPromotionEvaluation = {
  scopedSubject: string;
  status: "applied" | "blocked";
  recommendedLevel: number;
  currentLevel: number;
  confidence: number;
  candidateStreak: number;
  gateFailures: string[];
  latestMasteryCheckStatus: "missing" | "completed" | "not_completed";
  cooldownActive: boolean;
};

function parseProfile(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON and use defaults.
  }
  return {};
}

function parseOverrides(raw: string | null | undefined): Record<string, SubjectLevelOverride> {
  const profile = parseProfile(raw);
  const value = profile.adminSubjectLevelOverrides;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out: Record<string, SubjectLevelOverride> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const level = typeof row.level === "number" && Number.isFinite(row.level) ? Math.round(row.level) : null;
    const appliedAt = typeof row.appliedAt === "string" && row.appliedAt.trim() ? row.appliedAt : null;
    const appliedBy = typeof row.appliedBy === "string" && row.appliedBy.trim() ? row.appliedBy : null;
    if (!level || !appliedAt || !appliedBy) continue;

    out[key.trim().toLowerCase()] = {
      level,
      appliedAt,
      appliedBy,
      confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? Math.round(row.confidence) : undefined,
      reasons: Array.isArray(row.reasons) ? row.reasons.filter((item): item is string => typeof item === "string") : undefined,
    };
  }
  return out;
}

function parseAutoPromotionState(raw: string | null | undefined): AutoPromotionState {
  const profile = parseProfile(raw);
  const value = profile.autoPromotionState;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { cyclesByScope: {}, historyByScope: {} };
  }

  const asObject = value as Record<string, unknown>;
  const cyclesInput = asObject.cyclesByScope;
  const historyInput = asObject.historyByScope;

  const cyclesByScope: Record<string, AutoPromotionCycleState> = {};
  if (cyclesInput && typeof cyclesInput === "object" && !Array.isArray(cyclesInput)) {
    for (const [key, entry] of Object.entries(cyclesInput as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      cyclesByScope[key.trim().toLowerCase()] = {
        lastCandidateSignature: typeof row.lastCandidateSignature === "string" && row.lastCandidateSignature.trim()
          ? row.lastCandidateSignature
          : null,
        candidateStreak: typeof row.candidateStreak === "number" && Number.isFinite(row.candidateStreak)
          ? Math.max(0, Math.floor(row.candidateStreak))
          : 0,
        lastEvaluatedAt: typeof row.lastEvaluatedAt === "string" && row.lastEvaluatedAt.trim()
          ? row.lastEvaluatedAt
          : new Date(0).toISOString(),
      };
    }
  }

  const historyByScope: Record<string, AutoPromotionHistoryEntry[]> = {};
  if (historyInput && typeof historyInput === "object" && !Array.isArray(historyInput)) {
    for (const [key, entries] of Object.entries(historyInput as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      const cleaned = entries
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
          const row = entry as Record<string, unknown>;
          const promotedAt = typeof row.promotedAt === "string" && row.promotedAt.trim() ? row.promotedAt : null;
          const promotedToLevel = typeof row.promotedToLevel === "number" && Number.isFinite(row.promotedToLevel)
            ? Math.round(row.promotedToLevel)
            : null;
          const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence)
            ? Math.round(row.confidence)
            : null;
          const reason = typeof row.reason === "string" ? row.reason : "";
          const evidence = row.evidenceSnapshot;
          if (!promotedAt || !promotedToLevel || confidence === null || !evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
          return {
            promotedAt,
            promotedToLevel,
            confidence,
            reason,
            evidenceSnapshot: evidence as AutoPromotionHistoryEntry["evidenceSnapshot"],
          } satisfies AutoPromotionHistoryEntry;
        })
        .filter((item): item is AutoPromotionHistoryEntry => item !== null);
      historyByScope[key.trim().toLowerCase()] = cleaned.slice(-10);
    }
  }

  return { cyclesByScope, historyByScope };
}

function parseScopedSubject(scopedSubject: string): { parentSubject: string; strand: string | null } {
  const normalized = String(scopedSubject ?? "").trim().toLowerCase();
  if (normalized.includes(":")) {
    const [parentSubject, strandRaw] = normalized.split(":", 2);
    return { parentSubject, strand: strandRaw || null };
  }
  return { parentSubject: normalized, strand: null };
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed metadata.
  }
  return {};
}

function matchesScopedSubject(scopedSubject: string, row: {
  contentType: string;
  topic: string | null;
  skillFocus: string | null;
  metadataJson: string | null;
}): boolean {
  const scope = parseScopedSubject(scopedSubject);
  const text = `${String(row.contentType ?? "").toLowerCase()} ${String(row.topic ?? "").toLowerCase()} ${String(row.skillFocus ?? "").toLowerCase()}`;
  const meta = parseMetadata(row.metadataJson);
  const metaText = `${String(meta.subject ?? "").toLowerCase()} ${String(meta.strand ?? "").toLowerCase()} ${String(meta.skillFocus ?? "").toLowerCase()} ${String(meta.topic ?? "").toLowerCase()} ${String(meta.template ?? "").toLowerCase()} ${String(meta.activityType ?? "").toLowerCase()}`;
  const haystack = `${text} ${metaText}`;

  if (scope.parentSubject === "english") {
    if (scope.strand) {
      if (scope.strand === "comprehension") {
        return haystack.includes("comprehension") || haystack.includes("reading comprehension") || haystack.includes("reading");
      }
      if (scope.strand === "speaking-listening") {
        return haystack.includes("speaking") || haystack.includes("listening") || haystack.includes("oracy");
      }
      return haystack.includes(scope.strand.replace("-", " ")) || haystack.includes(scope.strand);
    }
    return haystack.includes("english") || haystack.includes("reading") || haystack.includes("grammar") || haystack.includes("writing");
  }

  if (scope.parentSubject === "maths") {
    return haystack.includes("math") || haystack.includes("arithmetic") || haystack.includes("number");
  }

  if (scope.parentSubject === "science") {
    return haystack.includes("science") || haystack.includes("biology") || haystack.includes("chemistry") || haystack.includes("physics");
  }

  return haystack.includes(scope.parentSubject.replace("-", " ")) || haystack.includes(scope.parentSubject);
}

function isMasteryCheckAssignment(row: {
  contentType: string;
  topic: string | null;
  skillFocus: string | null;
  metadataJson: string | null;
}): boolean {
  const meta = parseMetadata(row.metadataJson);
  const template = String(meta.template ?? "").toLowerCase();
  const activityType = String(meta.activityType ?? "").toLowerCase();
  const topic = String(row.topic ?? "").toLowerCase();
  const skillFocus = String(row.skillFocus ?? "").toLowerCase();
  const combined = `${template} ${activityType} ${topic} ${skillFocus}`;
  return combined.includes("mastery-check") || combined.includes("mastery check");
}

function latestPromotionAt(history: AutoPromotionHistoryEntry[]): Date | null {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(b.promotedAt).getTime() - new Date(a.promotedAt).getTime());
  const latest = sorted[0];
  const ts = latest ? new Date(latest.promotedAt) : null;
  return ts && Number.isFinite(ts.getTime()) ? ts : null;
}

function resolveGenerationSubject(input: { parentSubject: string; strand: string | null; yearGroup: string | null }): Subject | null {
  const normalizedParent = String(input.parentSubject ?? "").trim().toLowerCase();

  if (normalizedParent === "english") {
    // Always use "english-language" as the parent subject for the AI generator.
    // The specific strand is passed separately via the englishStrand field in the prefill
    // contract. This ensures the subject is accepted by aiGeneratorSubjectsForYearGroup,
    // which replaces all internal English strand subjects (grammar, reading, spelling, etc.)
    // with "english-language" for Year 1–6 primary years.
    return "english-language";
  }

  if (normalizedParent === "maths") return "maths";
  if (normalizedParent === "science") return "science";

  const gcseMap: Record<string, Subject> = {
    french: "gcse-french",
    spanish: "gcse-spanish",
    german: "gcse-german",
    mandarin: "gcse-mandarin",
    history: "gcse-history",
    geography: "gcse-geography",
    computing: "gcse-computer-science",
    "citizenship-pshe": "gcse-citizenship-studies",
    "pe-health": "gcse-physical-education",
    "gcse-practice": input.yearGroup && /year\s*(10|11)/i.test(input.yearGroup) ? "gcse-practice" as Subject : "sats-practice",
  };

  return gcseMap[normalizedParent] ?? normalizeSubject(normalizedParent);
}

function yearGroupFromLearningLevel(level: number | null | undefined): string | null {
  if (!Number.isFinite(Number(level))) return null;
  const rounded = Math.max(0, Math.min(11, Math.round(Number(level))));
  if (rounded === 0) return "Reception";
  return `Year ${rounded}`;
}

function resolveTargetLearningYearGroup(input: {
  generatorHint: { level: number; yearGroup: string | null } | null;
  progressionLevel: number | null | undefined;
  studentYearGroup: string | null;
}): { yearGroup: string | null; source: "qlf" | "progression" | "fallback" } {
  const hintedYearGroup = normalizeYearGroup(input.generatorHint?.yearGroup);
  const levelYearGroup = normalizeYearGroup(yearGroupFromLearningLevel(input.generatorHint?.level ?? input.progressionLevel));
  if (hintedYearGroup && levelYearGroup && hintedYearGroup !== levelYearGroup) {
    const hintedOrdinal = yearGroupToOrdinal(hintedYearGroup);
    const levelOrdinal = yearGroupToOrdinal(levelYearGroup);
    if (hintedOrdinal !== null && levelOrdinal !== null && hintedOrdinal < levelOrdinal) {
      return { yearGroup: hintedYearGroup, source: "qlf" };
    }
    return { yearGroup: levelYearGroup, source: "progression" };
  }
  if (hintedYearGroup) return { yearGroup: hintedYearGroup, source: "qlf" };
  if (levelYearGroup) return { yearGroup: levelYearGroup, source: "progression" };

  return { yearGroup: normalizeYearGroup(input.studentYearGroup), source: "fallback" };
}

function buildGenerationTargets(input: {
  contentGaps: Array<{
    scopedSubject: string;
    strand: string | null;
    currentLevel: number;
    reasons: string[];
    evidenceSummary: {
      averageScore: number;
    };
    generatorHint: { subject: string; strand: string | null; level: number; yearGroup: string | null; keyStage: string | null; skillFocus: string; reason: string } | null;
  }>;
  studentYearGroup: string | null;
  studentKeyStage: string | null;
}): AiGenerationTarget[] {
  return input.contentGaps
    .map((row) => {
      const studentYearGroup = normalizeYearGroup(input.studentYearGroup) ?? null;
      const studentKeyStage = studentYearGroup
        ? keyStageForYearGroup(studentYearGroup)
        : input.studentKeyStage;
      const parsedScope = parseScopedSubject(row.scopedSubject);
      const parentSubject = parsedScope.parentSubject;
      const targetReason = row.generatorHint?.reason?.trim() || row.reasons[0]?.trim() || "Progression recommends targeted practice.";
      const fallbackSkillFocus = row.reasons[0]?.trim() || parentSubject;
      const targetLearning = resolveTargetLearningYearGroup({
        generatorHint: row.generatorHint,
        progressionLevel: row.currentLevel,
        studentYearGroup,
      });
      const targetLearningYearGroup = targetLearning.yearGroup;
      const targetLearningKeyStage = targetLearningYearGroup
        ? keyStageForYearGroup(targetLearningYearGroup)
        : row.generatorHint?.keyStage ?? studentKeyStage;
      const subjectLevel = row.generatorHint?.level ?? row.currentLevel ?? null;
      const strandLevel = row.strand ? subjectLevel : null;
      const subject = resolveGenerationSubject({
        parentSubject,
        strand: row.strand,
        yearGroup: targetLearningYearGroup,
      });
      if (!subject) return null;

      const prefillContract = buildUniversalPrefillContract({
        trigger: "student-target",
        fields: {
          yearGroup: { value: targetLearningYearGroup, source: targetLearning.source === "fallback" ? "fallback" : "prediction", confidence: targetLearningYearGroup ? "high" : "low" },
          keyStage: { value: targetLearningKeyStage, source: targetLearningYearGroup ? "curriculum" : "prediction", confidence: targetLearningYearGroup ? "high" : "medium" },
          studentYearGroup: { value: studentYearGroup, source: "student", confidence: studentYearGroup ? "high" : "low" },
          studentKeyStage: { value: studentKeyStage, source: studentYearGroup ? "curriculum" : "prediction", confidence: studentKeyStage ? "high" : "low" },
          targetLearningYearGroup: { value: targetLearningYearGroup, source: targetLearning.source === "fallback" ? "fallback" : "prediction", confidence: targetLearningYearGroup ? "high" : "low" },
          targetLearningKeyStage: { value: targetLearningKeyStage, source: targetLearningYearGroup ? "curriculum" : "prediction", confidence: targetLearningKeyStage ? "high" : "low" },
          subjectLevel: { value: subjectLevel, source: "progression", confidence: subjectLevel ? "medium" : "low" },
          strandLevel: { value: strandLevel, source: row.strand ? "progression" : "fallback", confidence: strandLevel ? "medium" : "low" },
          levelSource: { value: targetLearning.source, source: "prediction", confidence: "medium" },
          ageGroup: { value: targetLearningYearGroup ? ageGroupForYearGroup(targetLearningYearGroup) : null, source: "curriculum", confidence: targetLearningYearGroup ? "high" : "low" },
          subject: { value: subject, source: "prediction", confidence: "high" },
          englishStrand: { value: row.strand, source: row.strand ? "prediction" : "fallback", confidence: row.strand ? "medium" : "low" },
          skillFocus: { value: row.generatorHint?.skillFocus?.trim() || fallbackSkillFocus, source: row.generatorHint?.skillFocus ? "prediction" : "recommendation", confidence: row.generatorHint?.skillFocus ? "high" : "medium" },
          topic: { value: row.generatorHint?.skillFocus?.trim() || fallbackSkillFocus, source: "recommendation", confidence: "medium" },
          activityType: { value: "targeted practice", source: "recommendation", confidence: "medium" },
          masteryOutcome: { value: targetReason, source: "recommendation", confidence: "medium" },
          curriculumPathway: { value: targetLearningYearGroup ? curriculumPathwayForYearGroup(targetLearningYearGroup) : null, source: "curriculum", confidence: targetLearningYearGroup ? "high" : "low" },
          countryRegion: { value: "UK", source: "fallback", confidence: "low" },
          curriculumFramework: { value: "National Curriculum England", source: "fallback", confidence: "low" },
          examBoard: { value: null, source: "fallback", confidence: "low" },
          examBoardSource: { value: "auto", source: "fallback", confidence: "low" },
          difficulty: { value: Math.max(1, Math.min(5, Math.round(row.generatorHint?.level ?? row.currentLevel ?? 3))), source: row.generatorHint?.level ? "prediction" : "recommendation", confidence: row.generatorHint?.level ? "high" : "medium" },
          itemCount: { value: targetLearningYearGroup && /Year\s*(10|11)/i.test(targetLearningYearGroup) ? 6 : 5, source: "policy", confidence: "medium" },
          aiMode: { value: "live_openai_only", source: "policy", confidence: "high" },
          visualGenerationEnabled: { value: false, source: "policy", confidence: "high" },
          visualGenerationMode: { value: "planned_only", source: "policy", confidence: "high" },
          maxVisualsPerLesson: { value: 2, source: "policy", confidence: "high" },
          visualAllowedSubjects: { value: [subject], source: "policy", confidence: "high" },
          requireVisualApproval: { value: true, source: "policy", confidence: "high" },
        },
        warnings: targetLearningYearGroup ? [] : ["Missing target learning year group for student-triggered prefill."],
        blockingIssues: targetLearningYearGroup ? [] : ["Student-triggered prefill requires target learning year group before generation."],
      });

      const target: AiGenerationTarget = {
        scopedSubject: row.scopedSubject,
        subject,
        strand: row.strand,
        yearGroup: targetLearningYearGroup,
        keyStage: targetLearningKeyStage,
        studentYearGroup,
        studentKeyStage,
        targetLearningYearGroup,
        targetLearningKeyStage,
        subjectLevel,
        strandLevel,
        levelSource: targetLearning.source,
        skillFocus: row.generatorHint?.skillFocus?.trim() || fallbackSkillFocus,
        difficulty: Math.max(1, Math.min(5, Math.round(row.generatorHint?.level ?? row.currentLevel ?? 3))),
        accuracy: Math.max(0, Math.min(100, Math.round(row.evidenceSummary.averageScore ?? 0))),
        reason: targetReason,
        prefillContract,
      };
      return target;
    })
    .filter((item): item is AiGenerationTarget => item !== null)
    .slice(0, 8);
}

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;

  const decisionBrain = await getProgressionDecisionBrainView({ studentId: id });
  if (!decisionBrain) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  const { student } = decisionBrain;

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const selectedSubjects = decisionBrain.selectedSubjects;

  if (!selectedSubjects.length) {
    return NextResponse.json({
      ok: false,
      code: "onboarding_required",
      message: "No subject configuration found yet.",
      recommendations: [],
      grouped: [],
      contentGaps: [],
    }, { status: 409 });
  }

  if (!decisionBrain.quick || decisionBrain.quick.status !== "completed") {
    return NextResponse.json({
      ok: false,
      code: "placement_required",
      message: "Quick Level Finder is not completed yet.",
      recommendations: [],
      grouped: [],
      contentGaps: [],
    }, { status: 409 });
  }

  const {
    attempts,
    assignments,
    studentSkills,
    progressRecords,
  } = decisionBrain;
  const progression = decisionBrain.progression;
  if (!progression) {
    return NextResponse.json({ error: "Unable to build progression recommendations." }, { status: 500 });
  }
  const generationTargets = buildGenerationTargets({
    contentGaps: progression.contentGaps,
    studentYearGroup: student.yearGroup,
    studentKeyStage: student.studentProfile?.keyStageLevel ?? null,
  });

  const profile = parseProfile(profileJson);
  const overrides = parseOverrides(profileJson);
  const autoPromotionState = parseAutoPromotionState(profileJson);
  const now = new Date();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const autoPromotionsApplied: Array<{
    scopedSubject: string;
    previousLevel: number | null;
    promotedToLevel: number;
    confidence: number;
    reason: string;
  }> = [];
  const autoPromotionEvaluations: AutoPromotionEvaluation[] = [];
  let autoStateChanged = false;
  let overridesChanged = false;

  for (const recommendation of progression.recommendations) {
    const scopedSubject = recommendation.scopedSubject.trim().toLowerCase();
    const signature = `${recommendation.status}|${recommendation.action}|${recommendation.recommendedLevel}`;
    const priorCycle = autoPromotionState.cyclesByScope[scopedSubject] ?? {
      lastCandidateSignature: null,
      candidateStreak: 0,
      lastEvaluatedAt: new Date(0).toISOString(),
    };

    const isPromotionCandidate = recommendation.status === "ready_to_advance"
      && recommendation.action === "recommend_level_up"
      && recommendation.recommendedLevel > recommendation.currentLevel;

    const nextCycle: AutoPromotionCycleState = {
      lastCandidateSignature: isPromotionCandidate ? signature : null,
      candidateStreak: isPromotionCandidate
        ? (priorCycle.lastCandidateSignature === signature ? priorCycle.candidateStreak + 1 : 1)
        : 0,
      lastEvaluatedAt: now.toISOString(),
    };
    autoPromotionState.cyclesByScope[scopedSubject] = nextCycle;
    autoStateChanged = true;

    const gateFailures: string[] = [];
    if (!isPromotionCandidate) {
      gateFailures.push("Promotion gate failed: recommendation is not ready_to_advance/recommend_level_up.");
    }
    if (recommendation.confidence < 75) {
      gateFailures.push(`Promotion gate failed: confidence ${recommendation.confidence}% is below 75%.`);
    }
    if (recommendation.evidenceSummary.activeWeakAreas > 0) {
      gateFailures.push("Promotion gate failed: active weak areas remain.");
    }
    if (nextCycle.candidateStreak < 2) {
      gateFailures.push("Stability gate failed: same recommendation has not repeated for 2 consecutive evaluation cycles.");
    }

    const relevantAssignments = assignments.filter((row) => matchesScopedSubject(scopedSubject, {
      contentType: row.content.contentType,
      topic: row.content.topic,
      skillFocus: row.content.skillFocus,
      metadataJson: row.content.metadataJson,
    }));
    const latestMasteryCheck = relevantAssignments.find((row) => isMasteryCheckAssignment({
      contentType: row.content.contentType,
      topic: row.content.topic,
      skillFocus: row.content.skillFocus,
      metadataJson: row.content.metadataJson,
    })) ?? null;

    if (!latestMasteryCheck) {
      gateFailures.push("Fresh mastery gate failed: no generated mastery-check assignment found for this subject.");
    } else if (String(latestMasteryCheck.status ?? "").toLowerCase() !== "completed") {
      gateFailures.push("Fresh mastery gate failed: latest generated mastery-check assignment is not completed.");
    }

    const latestMasteryCheckStatus: AutoPromotionEvaluation["latestMasteryCheckStatus"] = !latestMasteryCheck
      ? "missing"
      : String(latestMasteryCheck.status ?? "").toLowerCase() === "completed"
        ? "completed"
        : "not_completed";

    const history = autoPromotionState.historyByScope[scopedSubject] ?? [];
    const lastPromotion = latestPromotionAt(history);
    const cooldownActive = Boolean(lastPromotion && now.getTime() - lastPromotion.getTime() < sevenDaysMs);
    if (cooldownActive) {
      gateFailures.push("Cooldown gate failed: last promotion was within 7 days.");
    }

    const existingOverride = overrides[scopedSubject];
    if (existingOverride && existingOverride.level >= recommendation.recommendedLevel) {
      gateFailures.push("Promotion skipped: existing level override is already at or above recommended level.");
    }

    if (gateFailures.length > 0) {
      autoPromotionEvaluations.push({
        scopedSubject,
        status: "blocked",
        recommendedLevel: recommendation.recommendedLevel,
        currentLevel: recommendation.currentLevel,
        confidence: recommendation.confidence,
        candidateStreak: nextCycle.candidateStreak,
        gateFailures,
        latestMasteryCheckStatus,
        cooldownActive,
      });
      continue;
    }

    const promotionReason = [
      "Auto-promotion applied after all safety gates passed.",
      ...recommendation.reasons,
    ].join(" ");

    overrides[scopedSubject] = {
      level: recommendation.recommendedLevel,
      appliedAt: now.toISOString(),
      appliedBy: `auto:${session.userId}`,
      confidence: recommendation.confidence,
      reasons: [promotionReason],
    };
    overridesChanged = true;

    const historyEntry: AutoPromotionHistoryEntry = {
      promotedAt: now.toISOString(),
      promotedToLevel: recommendation.recommendedLevel,
      confidence: recommendation.confidence,
      reason: promotionReason,
      evidenceSnapshot: {
        status: recommendation.status,
        action: recommendation.action,
        currentLevel: recommendation.currentLevel,
        recommendedLevel: recommendation.recommendedLevel,
        confidence: recommendation.confidence,
        activityCount: recommendation.evidenceSummary.activityCount,
        completedAssignments: recommendation.evidenceSummary.completedAssignments,
        attemptCount: recommendation.evidenceSummary.attemptCount,
        averageScore: recommendation.evidenceSummary.averageScore,
        activeWeakAreas: recommendation.evidenceSummary.activeWeakAreas,
        masterySignals: recommendation.evidenceSummary.masterySignals,
      },
    };
    autoPromotionState.historyByScope[scopedSubject] = [...history, historyEntry].slice(-10);
    autoStateChanged = true;
    nextCycle.candidateStreak = 0;
    nextCycle.lastCandidateSignature = null;

    autoPromotionsApplied.push({
      scopedSubject,
      previousLevel: existingOverride?.level ?? null,
      promotedToLevel: recommendation.recommendedLevel,
      confidence: recommendation.confidence,
      reason: promotionReason,
    });
    autoPromotionEvaluations.push({
      scopedSubject,
      status: "applied",
      recommendedLevel: recommendation.recommendedLevel,
      currentLevel: recommendation.currentLevel,
      confidence: recommendation.confidence,
      candidateStreak: 2,
      gateFailures: [],
      latestMasteryCheckStatus,
      cooldownActive: false,
    });
  }

  if (overridesChanged || autoStateChanged) {
    const nextProfile = {
      ...profile,
      adminSubjectLevelOverrides: overrides,
      autoPromotionState,
    };

    await prisma.studentProfile.upsert({
      where: { childId: student.id },
      update: {
        aiLearningProfileJson: JSON.stringify(nextProfile),
      },
      create: {
        childId: student.id,
        aiLearningProfileJson: JSON.stringify(nextProfile),
      },
    });
  }

  if (autoPromotionsApplied.length > 0) {
    for (const applied of autoPromotionsApplied) {
      const latestHistory = autoPromotionState.historyByScope[applied.scopedSubject]?.slice(-1)[0] ?? null;
      await writeAuditLog({
        actorUserId: session.userId,
        action: "applied",
        entityType: "student_auto_promotion",
        entityId: `${student.id}:${applied.scopedSubject}`,
        metadata: {
          studentId: student.id,
          studentName: student.name,
          scopedSubject: applied.scopedSubject,
          previousLevel: applied.previousLevel,
          promotedToLevel: applied.promotedToLevel,
          confidence: applied.confidence,
          reason: applied.reason,
          evidenceSnapshot: latestHistory?.evidenceSnapshot ?? null,
        },
      });
    }
  }

  const totalEvidencePoints = attempts.length + assignments.length + progressRecords.filter((row) => row.completed).length + studentSkills.filter((row) => row.attempts > 0).length;
  const recommendations = progression.recommendations.map((row) => {
    const override = overrides[row.scopedSubject] ?? null;
    return {
      ...row,
      adminAppliedLevel: override?.level ?? null,
      adminAppliedAt: override?.appliedAt ?? null,
      adminAppliedBy: override?.appliedBy ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    },
    message: progression.hasEvidence && totalEvidencePoints > 0
      ? "Progression recommendations generated."
      : "Not enough learning evidence yet.",
    recommendations,
    generationTargets,
    autoPromotion: {
      appliedCount: autoPromotionsApplied.length,
      applied: autoPromotionsApplied,
      evaluations: autoPromotionEvaluations,
    },
    grouped: progression.grouped,
    contentGaps: progression.contentGaps,
    summary: {
      total: progression.recommendations.length,
      needsSupport: progression.recommendations.filter((row) => row.status === "needs_support").length,
      readyToAdvance: progression.recommendations.filter((row) => row.status === "ready_to_advance").length,
      reviewNeeded: progression.recommendations.filter((row) => row.status === "review_needed").length,
      friendlyHeadline: decisionBrain.summary?.friendlyHeadline ?? "Keep practising",
    },
    heartbeatSummary: decisionBrain.heartbeatSummary,
    quickLevelFinderBaseline: decisionBrain.quickLevelFinderBaseline,
    languageReadiness: decisionBrain.languageReadiness,
  });
}

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;

  const parsed = applySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const action = parsed.data.action ?? "apply";
  if (action === "apply" && typeof parsed.data.recommendedLevel !== "number") {
    return NextResponse.json({ error: "recommendedLevel is required for apply action." }, { status: 400 });
  }

  const student = await prisma.childProfile.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
        },
      },
    },
  });

  if (!student || !student.id) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const scopedSubject = parsed.data.scopedSubject.trim().toLowerCase();
  const existingJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const profile = parseProfile(existingJson);
  const overrides = parseOverrides(existingJson);

  if (action === "revert") {
    delete overrides[scopedSubject];
  } else {
    overrides[scopedSubject] = {
      level: parsed.data.recommendedLevel!,
      appliedAt: new Date().toISOString(),
      appliedBy: session.userId,
      confidence: parsed.data.confidence,
      reasons: parsed.data.reasons,
    };
  }

  const nextProfile = {
    ...profile,
    adminSubjectLevelOverrides: overrides,
  };

  await prisma.studentProfile.upsert({
    where: { childId: student.id },
    update: {
      aiLearningProfileJson: JSON.stringify(nextProfile),
    },
    create: {
      childId: student.id,
      aiLearningProfileJson: JSON.stringify(nextProfile),
    },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: action === "revert" ? "reverted" : "updated",
    entityType: "student_subject_level_override",
    entityId: `${student.id}:${scopedSubject}`,
    metadata: {
      studentId: student.id,
      studentName: student.name,
      scopedSubject,
      action,
      recommendedLevel: parsed.data.recommendedLevel ?? null,
      confidence: parsed.data.confidence ?? null,
      reasons: parsed.data.reasons ?? [],
    },
  });

  return NextResponse.json({
    ok: true,
    studentId: student.id,
    scopedSubject,
    action,
  });
}
