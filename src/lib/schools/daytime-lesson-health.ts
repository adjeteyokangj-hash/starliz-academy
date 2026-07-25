import { buildDaytimeSessionPlan } from "@/lib/schools/daytime-session-plan";
import { estimatedMinutesForItemCount, periodMinutes } from "@/lib/schools/school-day-period";
import { hasPassedDaytimeMachineBlackBox, summarizeDaytimeBlackBoxFailures } from "@/lib/schools/daytime-black-box";
import { classifyDaytimeSubjectMode } from "@/lib/schools/daytime-subject-mode";
import {
  normalizeDaytimeStagePack,
  validateDaytimeStagePack,
} from "@/lib/schools/daytime-stage-validators";

export type LessonReviewStatus = "draft" | "machine_failed" | "awaiting_review" | "approved";

export type LessonHealthCheckId =
  | "curriculum"
  | "reading_age"
  | "answers"
  | "duration"
  | "vocabulary"
  | "sequencing"
  | "completeness"
  | "safety"
  | "clarity";

export type LessonHealthCheck = {
  id: LessonHealthCheckId;
  label: string;
  passed: boolean;
  detail?: string;
};

export type DaytimeLessonHealth = {
  overall: "PASS" | "FAIL";
  checkedAt: string;
  periodMinutes: number;
  totalEstimatedMinutes: number;
  stageCount: number;
  checks: LessonHealthCheck[];
  reason: string | null;
  regenerateHint: string | null;
  weekDiversity?: {
    weekStart: string;
    passage: string;
    vocabularyOverlap: string;
    questionOverlap: string;
    workedExamples: string;
    scenarios: string;
    blocked: boolean;
    blockedReason: string | null;
    comparedAgainst: string[];
  } | null;
};

export type StagePackForHealth = {
  id: string;
  contentType: string;
  skillFocus: string | null;
  contentJson: string;
  metadataJson: string | null;
  blackBoxPassed: boolean;
};

const CHECK_LABELS: Record<LessonHealthCheckId, string> = {
  curriculum: "Curriculum",
  reading_age: "Reading age",
  answers: "Answers",
  duration: "Duration",
  vocabulary: "Vocabulary",
  sequencing: "Sequencing",
  completeness: "Completeness",
  safety: "Safety",
  clarity: "Clarity",
};

/** Prisma cuid / stage-seed fragments that must never appear in pupil-facing copy. */
const INTERNAL_ID_LEAK = /(?:^|[^a-z0-9])(?:(?:warmup|core|stretch)-)?c[a-z0-9]{20,}(?:[^a-z0-9]|$)/i;

function collectStudentFacingText(contentJson: string): string {
  const parsed = parseJson(contentJson);
  const chunks: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) chunks.push(value);
  };
  const walkItem = (item: unknown) => {
    if (!item || typeof item !== "object") {
      push(item);
      return;
    }
    const row = item as Record<string, unknown>;
    push(row.passage);
    push(row.story);
    push(row.text);
    push(row.question);
    push(row.prompt);
    push(row.word);
    push(row.answer);
    push(row.correctAnswer);
    push(row.explanation);
    push(row.hint);
    if (Array.isArray(row.hints)) row.hints.forEach(push);
    if (Array.isArray(row.options)) row.options.forEach(push);
    if (Array.isArray(row.choices)) row.choices.forEach(push);
    if (row.breakdown && typeof row.breakdown === "object") {
      const b = row.breakdown as Record<string, unknown>;
      push(b.simplerQuestion);
      push(b.startingPoint);
      if (Array.isArray(b.steps)) b.steps.forEach(push);
    }
  };
  if (Array.isArray(parsed)) {
    parsed.forEach(walkItem);
  } else if (parsed && typeof parsed === "object") {
    const row = parsed as Record<string, unknown>;
    push(row.title);
    push(row.explanation);
    push(row.ruleExplanation);
    push(row.scenarioOrObservation);
    if (row.passage && typeof row.passage === "object") {
      const p = row.passage as Record<string, unknown>;
      push(p.title);
      push(p.text);
      if (Array.isArray(p.paragraphs)) p.paragraphs.forEach(push);
    } else {
      push(row.passage);
    }
    if (Array.isArray(row.vocabulary)) {
      row.vocabulary.forEach((vocab) => {
        if (vocab && typeof vocab === "object") {
          const v = vocab as Record<string, unknown>;
          push(v.word);
          push(v.childFriendlyMeaning);
          push(v.meaning);
          push(v.example);
        }
      });
    }
    if (Array.isArray(row.questions)) row.questions.forEach(walkItem);
    if (Array.isArray(row.items)) row.items.forEach(walkItem);
    if (Array.isArray(row.words)) row.words.forEach(walkItem);
  }
  return chunks.join("\n");
}

export function studentFacingTextLeaksInternalIds(contentJson: string): boolean {
  return INTERNAL_ID_LEAK.test(collectStudentFacingText(contentJson));
}

function parseJson(value: string | null | undefined): unknown {
  if (!value?.trim()) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function countItems(contentJson: string): number {
  const parsed = parseJson(contentJson);
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed && typeof parsed === "object") {
    const row = parsed as Record<string, unknown>;
    const questionCount = Array.isArray(row.questions)
      ? row.questions.length
      : Array.isArray(row.items)
        ? row.items.length
        : Array.isArray(row.words)
          ? row.words.length
          : 0;
    const activityCount = Array.isArray(row.activities) ? row.activities.length : 0;
    return Math.max(questionCount, activityCount);
  }
  return 0;
}

function stageMeta(metadataJson: string | null | undefined): {
  stage?: string;
  stageIndex?: number;
  estimatedMinutes?: number;
} {
  const parsed = parseJson(metadataJson);
  if (!parsed || typeof parsed !== "object") return {};
  const session = (parsed as { daytimeSession?: Record<string, unknown> }).daytimeSession;
  if (!session || typeof session !== "object") return {};
  return {
    stage: typeof session.stage === "string" ? session.stage : undefined,
    stageIndex: typeof session.stageIndex === "number" ? session.stageIndex : undefined,
    estimatedMinutes: typeof session.estimatedMinutes === "number" ? session.estimatedMinutes : undefined,
  };
}

function check(
  id: LessonHealthCheckId,
  passed: boolean,
  detail?: string,
): LessonHealthCheck {
  return { id, label: CHECK_LABELS[id], passed, detail };
}

/** Build teacher-facing Lesson Health from period timing + staged packs (BB results already on packs). */
export function evaluateDaytimeLessonHealth(input: {
  startsAt: string;
  endsAt: string;
  subject: string;
  skillFocus?: string | null;
  stages: StagePackForHealth[];
  now?: Date;
  weekDiversity?: DaytimeLessonHealth["weekDiversity"];
}): DaytimeLessonHealth {
  const plan = buildDaytimeSessionPlan(input.startsAt, input.endsAt);
  const periodLength = periodMinutes(input.startsAt, input.endsAt) || plan.periodMinutes;
  const stages = input.stages;
  const totalEstimatedMinutes = stages.reduce((sum, stage) => {
    const meta = stageMeta(stage.metadataJson);
    if (meta.estimatedMinutes && meta.estimatedMinutes > 0) return sum + meta.estimatedMinutes;
    return sum + estimatedMinutesForItemCount(countItems(stage.contentJson));
  }, 0);

  const emptyStages = stages.filter((stage) => countItems(stage.contentJson) < 3);
  const allBbPassed = stages.length > 0 && stages.every((stage) => stage.blackBoxPassed);
  const expectedOrder = ["warmup", "core", "stretch"] as const;
  const sequencingOk = stages.length >= 2 && stages.every((stage, index) => {
    const meta = stageMeta(stage.metadataJson);
    if (meta.stageIndex != null) return meta.stageIndex === index;
    if (meta.stage) return meta.stage === expectedOrder[Math.min(index, expectedOrder.length - 1)];
    return true;
  });

  const skill = (input.skillFocus ?? "").trim().toLowerCase();
  const skillConsistent = !skill || stages.every((stage) => {
    const focus = (stage.skillFocus ?? "").trim().toLowerCase();
    return !focus || focus.includes(skill) || skill.includes(focus);
  });

  const durationOk = stages.length > 0
    && totalEstimatedMinutes >= Math.max(10, Math.round(periodLength * 0.45))
    && totalEstimatedMinutes <= Math.round(periodLength * 1.15);

  const clarityFailed = stages.filter((stage) => studentFacingTextLeaksInternalIds(stage.contentJson));

  const mode = classifyDaytimeSubjectMode(input.subject, input.skillFocus);
  const subjectIssues: string[] = [];
  const vocabIssues: string[] = [];
  const answerIssues: string[] = [];
  const safetyIssues: string[] = [];
  const readingAgeIssues: string[] = [];

  for (const stage of stages) {
    const meta = stageMeta(stage.metadataJson);
    const stageKey = (meta.stage === "warmup" || meta.stage === "core" || meta.stage === "stretch")
      ? meta.stage
      : "core";
    const targetMinutes = meta.estimatedMinutes
      || estimatedMinutesForItemCount(countItems(stage.contentJson));
    const normalized = normalizeDaytimeStagePack(parseJson(stage.contentJson), mode);
    if (!normalized) {
      subjectIssues.push(`${stageKey}: invalid stage content structure`);
      continue;
    }
    const issues = validateDaytimeStagePack({
      pack: normalized,
      mode,
      stage: stageKey,
      targetMinutes,
      lessonTitle: input.subject,
    });
    for (const issue of issues) {
      if (
        issue.code === "missing_passage"
        || issue.code === "passage_reference_without_passage"
        || issue.code === "questions_not_about_passage"
        || issue.code === "spelling_variety"
        || issue.code === "missing_maths_explanation"
        || issue.code === "missing_worked_example"
        || issue.code === "missing_reasoning"
        || issue.code === "missing_scaffold"
        || issue.code === "missing_independent"
        || issue.code === "generic_science_questions"
        || issue.code === "missing_science_task"
        || issue.code === "not_practical"
        || issue.code === "pe_as_reading"
        || issue.code === "pe_missing_warmup"
        || issue.code === "pe_missing_cooldown"
        || issue.code === "pe_missing_practice"
        || issue.code === "pe_unsafe_content"
        || issue.code === "generation_failed"
        || issue.code === "duration_mismatch"
        || issue.code === "missing_activities"
        || issue.code === "unsupported_activity_kind"
      ) {
        subjectIssues.push(`${stageKey}: ${issue.message}`);
      }
      if (issue.code === "missing_vocabulary" || issue.code === "missing_science_vocab") {
        vocabIssues.push(`${stageKey}: ${issue.message}`);
      }
      if (issue.code === "missing_answer" || issue.code === "missing_explanation") {
        answerIssues.push(`${stageKey}: ${issue.message}`);
      }
      if (issue.code === "pe_missing_safety") {
        safetyIssues.push(`${stageKey}: ${issue.message}`);
      }
    }

    const bbSummary = summarizeDaytimeBlackBoxFailures(stage.metadataJson);
    if (!stage.blackBoxPassed) {
      if (bbSummary.answersFailed) answerIssues.push(...bbSummary.details.filter((d) => /answer|options/i.test(d)));
      if (bbSummary.vocabularyFailed && mode !== "practical-pe") {
        vocabIssues.push(...bbSummary.details.filter((d) => /vocab|readability|language/i.test(d)));
      }
      if (bbSummary.safetyFailed || (mode === "practical-pe" && bbSummary.details.some((d) => /unsafe|safety|PE pack/i.test(d)))) {
        safetyIssues.push(...bbSummary.details.filter((d) => /unsafe|safety|PE pack|supervision/i.test(d)));
      }
      if (mode !== "practical-pe" && mode !== "practical-arts" && mode !== "practical-music") {
        if (bbSummary.readingAgeFailed) {
          readingAgeIssues.push(...bbSummary.details.filter((d) => /level|year|key stage|readability|too (easy|hard|simple|advanced)/i.test(d)));
        }
      }
      if (!bbSummary.answersFailed && !bbSummary.vocabularyFailed && !bbSummary.safetyFailed && !bbSummary.readingAgeFailed) {
        answerIssues.push(bbSummary.details[0] ?? `${stageKey}: machine item checks failed`);
      }
    }
  }

  const subjectStructureOk = subjectIssues.length === 0;
  const answersOk = allBbPassed && subjectStructureOk && answerIssues.length === 0;
  const readingAgeOk = mode === "practical-pe" || mode === "practical-arts" || mode === "practical-music"
    ? safetyIssues.length === 0 && (allBbPassed || readingAgeIssues.length === 0)
    : allBbPassed && readingAgeIssues.length === 0;
  const vocabularyOk = mode === "practical-pe"
    ? true
    : allBbPassed && vocabIssues.length === 0 && (
      mode === "guided-reading" || mode === "science" ? subjectStructureOk || vocabIssues.length === 0 : true
    );
  const safetyOk = mode === "practical-pe"
    ? safetyIssues.length === 0 && allBbPassed
    : allBbPassed && safetyIssues.length === 0;

  const checks: LessonHealthCheck[] = [
    check("completeness", stages.length >= 2 && emptyStages.length === 0 && subjectStructureOk, emptyStages.length
      ? `${emptyStages.length} stage(s) have too few items`
      : !subjectStructureOk
        ? subjectIssues[0]
        : stages.length < 2
          ? "Need at least warm-up and core packs"
          : undefined),
    check("sequencing", sequencingOk, sequencingOk ? undefined : "Stage order should be warm-up → core → stretch"),
    check("curriculum", skillConsistent, skillConsistent ? undefined : "Skill focus drifts across stages"),
    check("duration", durationOk, durationOk
      ? undefined
      : `Estimated ${totalEstimatedMinutes}m vs period ${periodLength}m`),
    check("answers", answersOk, !answersOk
      ? (answerIssues[0] ?? (!allBbPassed ? "One or more stages failed answer / item checks" : subjectIssues[0]))
      : undefined),
    check(
      "reading_age",
      readingAgeOk,
      readingAgeOk
        ? undefined
        : (readingAgeIssues[0] ?? (mode === "practical-pe"
          ? "PE age/movement checks did not pass"
          : "Age / level checks did not all pass")),
    ),
    check(
      "vocabulary",
      vocabularyOk,
      vocabularyOk
        ? undefined
        : (vocabIssues[0] ?? "Vocabulary / language checks did not all pass"),
    ),
    check(
      "safety",
      safetyOk,
      safetyOk
        ? undefined
        : (safetyIssues[0] ?? "Safety checks did not all pass"),
    ),
    check(
      "clarity",
      clarityFailed.length === 0,
      clarityFailed.length
        ? "Internal IDs appear in pupil-facing questions or passages"
        : undefined,
    ),
  ];

  const failed = checks.filter((row) => !row.passed);
  const overall = failed.length === 0 ? "PASS" : "FAIL";
  const reason = overall === "FAIL"
    ? (failed[0]?.detail ?? `${failed[0]?.label ?? "Check"} failed`)
    : null;

  let weekDiversity = input.weekDiversity ?? null;
  if (!weekDiversity) {
    for (const stage of stages) {
      const parsed = parseJson(stage.metadataJson);
      if (!parsed || typeof parsed !== "object") continue;
      const candidate = (parsed as { weekDiversity?: DaytimeLessonHealth["weekDiversity"] }).weekDiversity;
      if (candidate && typeof candidate === "object") {
        weekDiversity = candidate;
        break;
      }
    }
  }

  return {
    overall,
    checkedAt: (input.now ?? new Date()).toISOString(),
    periodMinutes: periodLength,
    totalEstimatedMinutes,
    stageCount: stages.length,
    checks,
    reason,
    regenerateHint: overall === "FAIL"
      ? "Regenerate this lesson from the timetable, or open Edit to repair a stage in Content Library."
      : null,
    weekDiversity,
  };
}

export function reviewStatusFromHealth(health: DaytimeLessonHealth): Exclude<LessonReviewStatus, "approved" | "draft"> {
  return health.overall === "PASS" ? "awaiting_review" : "machine_failed";
}

export function parseMachineHealthJson(value: string | null | undefined): DaytimeLessonHealth | null {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Partial<DaytimeLessonHealth>;
  if (row.overall !== "PASS" && row.overall !== "FAIL") return null;
  if (!Array.isArray(row.checks)) return null;
  return row as DaytimeLessonHealth;
}

export function stagePacksFromContentRows(
  rows: Array<{
    id: string;
    contentType: string;
    skillFocus: string | null;
    contentJson: string;
    metadataJson: string | null;
  }>,
): StagePackForHealth[] {
  return rows.map((row) => ({
    id: row.id,
    contentType: row.contentType,
    skillFocus: row.skillFocus,
    contentJson: row.contentJson,
    metadataJson: row.metadataJson,
    blackBoxPassed: hasPassedDaytimeMachineBlackBox(row.metadataJson),
  }));
}

export function serializeMachineHealth(health: DaytimeLessonHealth): string {
  return JSON.stringify(health);
}
