import { evaluateWeeklyHomeworkEligibility } from "@/lib/homework-phase1a/eligibility";
import { rankWeeklyWeaknesses } from "@/lib/homework-phase1a/weaknessRanking";
import { workloadCapForYearGroup } from "@/lib/homework-phase1a/workloadCap";
import type {
  GeneratedHomeworkBatch,
  HomeworkAuditEvent,
  HomeworkQuestionPlan,
  WeeklyWeaknessCandidate,
} from "@/lib/homework-phase1a/types";

type GenerationInput = {
  now: Date;
  timezone: string;
  studentId: string;
  yearGroup: string | null | undefined;
  completedSessionCount: number;
  startedSessionCount: number;
  existingBatchForWeek: boolean;
  weaknesses: WeeklyWeaknessCandidate[];
};

export type GenerationResult =
  | {
      created: false;
      reason: string;
      auditEvents: HomeworkAuditEvent[];
      weekStartIso: string;
      weekEndIso: string;
    }
  | {
      created: true;
      batch: GeneratedHomeworkBatch;
      auditEvents: HomeworkAuditEvent[];
    };

function nowIso(now: Date): string {
  return now.toISOString();
}

function capQuestionsByMinutes(questions: HomeworkQuestionPlan[], capMinutes: number): HomeworkQuestionPlan[] {
  if (capMinutes <= 0) return [];
  const selected: HomeworkQuestionPlan[] = [];
  let total = 0;
  for (const question of questions) {
    const nextTotal = total + Math.max(1, question.estimatedMinutes);
    if (nextTotal > capMinutes && selected.length > 0) break;
    if (nextTotal > capMinutes && selected.length === 0) {
      selected.push(question);
      break;
    }
    selected.push(question);
    total = nextTotal;
  }
  return selected;
}

export function generateWeeklyHomeworkBatch(input: GenerationInput): GenerationResult {
  const eligibility = evaluateWeeklyHomeworkEligibility({
    now: input.now,
    timezone: input.timezone,
    completedSessionCount: input.completedSessionCount,
    startedSessionCount: input.startedSessionCount,
    existingBatchForWeek: input.existingBatchForWeek,
  });

  if (eligibility.status !== "ELIGIBLE") {
    return {
      created: false,
      reason: eligibility.reason,
      weekStartIso: eligibility.weekStartIso,
      weekEndIso: eligibility.weekEndIso,
      auditEvents: [
        {
          action: "generation_skipped",
          reason: eligibility.reason,
          atIso: nowIso(input.now),
          metadata: {
            catchUpOnly: eligibility.catchUpOnly,
            completedSessionCount: input.completedSessionCount,
            startedSessionCount: input.startedSessionCount,
          },
        },
      ],
    };
  }

  const ranked = rankWeeklyWeaknesses(input.weaknesses);
  const cap = workloadCapForYearGroup(input.yearGroup);
  const plannedQuestions = ranked.map((candidate) => ({
    id: candidate.id,
    subject: candidate.subject,
    topic: candidate.topic ?? null,
    skill: candidate.skill ?? null,
    targetLearningYearGroup: candidate.targetLearningYearGroup ?? null,
    targetLearningKeyStage: candidate.targetLearningKeyStage ?? null,
    studentYearGroup: candidate.studentYearGroup ?? input.yearGroup ?? null,
    estimatedMinutes: Math.max(1, candidate.estimatedMinutes),
    required: true,
  }));

  const cappedQuestions = capQuestionsByMinutes(plannedQuestions, cap.maxMinutes);
  const plannedMinutes = cappedQuestions.reduce((sum, question) => sum + Math.max(1, question.estimatedMinutes), 0);

  return {
    created: true,
    batch: {
      studentId: input.studentId,
      timezone: input.timezone,
      weekStartIso: eligibility.weekStartIso,
      weekEndIso: eligibility.weekEndIso,
      status: "GENERATED",
      dueBeforeNextSession: true,
      sourceCompletedSessionCount: input.completedSessionCount,
      sourceStartedSessionCount: input.startedSessionCount,
      plannedMinutes,
      workloadCapMinutes: cap.maxMinutes,
      questions: cappedQuestions,
    },
    auditEvents: [
      {
        action: "generation",
        atIso: nowIso(input.now),
        metadata: {
          completedSessionCount: input.completedSessionCount,
          startedSessionCount: input.startedSessionCount,
          rankedCount: ranked.length,
          selectedCount: cappedQuestions.length,
          workloadCapMinutes: cap.maxMinutes,
          weekStartIso: eligibility.weekStartIso,
          weekEndIso: eligibility.weekEndIso,
        },
      },
    ],
  };
}
