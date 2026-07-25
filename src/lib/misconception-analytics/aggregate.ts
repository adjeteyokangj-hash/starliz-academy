/**
 * Derive-first misconception aggregators — pure functions over existing stores.
 * Human Tutor session writers are not touched; metadata is read via parseSessionMetadata.
 */

import {
  outcomeUiLabel,
  parseSessionMetadata,
  validateUnresolvedReport,
} from "@/lib/schools/human-support-session";
import { extractLearningDnaFromProfileJson } from "@/lib/learning_dna";
import type {
  AggregateMisconceptionInput,
  AiHelpTurnInput,
  AttemptPatternInput,
  HumanOutcomeLink,
  HumanSessionInput,
  LearningDnaInput,
  MisconceptionCohortSummary,
  MisconceptionSignal,
  MisconceptionSignalSource,
  MisconceptionSkillBucket,
  MisconceptionSourceCount,
  MisconceptionStudentSummary,
  SpellingMistakeInput,
} from "@/lib/misconception-analytics/types";
import { MISCONCEPTION_ANALYTICS_VERSION } from "@/lib/misconception-analytics/types";

const ATTEMPT_WINDOW = 12;
const MIN_REPEATED_WRONG = 3;
const DNA_MIN_COUNT = 2;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function questionKey(text: string | null | undefined): string {
  return normalize(text).slice(0, 80) || "unknown-question";
}

function parseDaytimeTutorPayload(raw: string | null | undefined): {
  message: string | null;
  needsTeacher: boolean;
  misconception: string | null;
  intent: string | null;
  source: string | null;
  questionKey: string | null;
} {
  if (!raw) {
    return {
      message: null,
      needsTeacher: false,
      misconception: null,
      intent: null,
      source: null,
      questionKey: null,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {
        message: raw.slice(0, 200),
        needsTeacher: false,
        misconception: null,
        intent: null,
        source: null,
        questionKey: null,
      };
    }
    return {
      message: typeof parsed.message === "string" ? parsed.message : null,
      needsTeacher: Boolean(parsed.needsTeacher),
      misconception: typeof parsed.misconception === "string" && parsed.misconception.trim()
        ? parsed.misconception.trim().slice(0, 400)
        : null,
      intent: typeof parsed.intent === "string" ? parsed.intent : null,
      source: typeof parsed.source === "string" ? parsed.source : null,
      questionKey: typeof parsed.questionKey === "string" ? parsed.questionKey : null,
    };
  } catch {
    return {
      message: raw.slice(0, 200),
      needsTeacher: false,
      misconception: null,
      intent: null,
      source: null,
      questionKey: null,
    };
  }
}

/** Latest non-empty misconception string from daytime tutor history payloads. */
export function latestMisconceptionFromTutorPayloads(
  payloads: Array<string | null | undefined>,
): string | null {
  for (let i = payloads.length - 1; i >= 0; i -= 1) {
    const parsed = parseDaytimeTutorPayload(payloads[i]);
    if (parsed.misconception) return parsed.misconception;
  }
  return null;
}

export function deriveAttemptPatternSignals(
  attempts: AttemptPatternInput[],
  nowIso: string,
): MisconceptionSignal[] {
  const bySkill = new Map<string, AttemptPatternInput[]>();
  for (const attempt of attempts) {
    const key = `${attempt.studentId}|${normalize(attempt.subject)}|${normalize(attempt.skillFocus)}`;
    const list = bySkill.get(key) ?? [];
    list.push(attempt);
    bySkill.set(key, list);
  }

  const signals: MisconceptionSignal[] = [];
  for (const [, rows] of bySkill) {
    const ordered = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, ATTEMPT_WINDOW);
    const wrong = ordered.filter((row) => !row.correct);
    if (wrong.length < MIN_REPEATED_WRONG) continue;

    const byQuestion = new Map<string, AttemptPatternInput[]>();
    for (const row of wrong) {
      const qk = questionKey(row.questionText);
      const list = byQuestion.get(qk) ?? [];
      list.push(row);
      byQuestion.set(qk, list);
    }

    let best: AttemptPatternInput[] = wrong;
    for (const group of byQuestion.values()) {
      if (group.length > best.length) best = group;
    }
    if (best.length < Math.min(MIN_REPEATED_WRONG, 2) && wrong.length < MIN_REPEATED_WRONG) continue;

    const sample = best[0] ?? wrong[0];
    const hintHeavy = wrong.filter((row) => row.hintsUsed > 0).length / wrong.length;
    const confidence = clampConfidence(0.45 + Math.min(0.4, wrong.length * 0.08) + hintHeavy * 0.15);

    signals.push({
      studentId: sample.studentId,
      subject: sample.subject,
      skillFocus: sample.skillFocus,
      source: "attempt_pattern",
      text: sample.questionText
        ? `Repeated incorrect answers on: ${sample.questionText.slice(0, 120)}`
        : `Repeated incorrect answers on ${sample.skillFocus}`,
      code: `attempt:${normalize(sample.subject)}:${normalize(sample.skillFocus)}`,
      confidence,
      evidenceRefs: wrong.slice(0, 6).map((row) => ({ kind: "attempt" as const, id: row.id })),
      detectedAt: sample.createdAt || nowIso,
      metadata: {
        wrongCount: wrong.length,
        sampleAnswerGiven: sample.answerGiven,
        hintHeavyRate: Math.round(hintHeavy * 100) / 100,
      },
    });
  }
  return signals;
}

export function deriveAiHelpSignals(turns: AiHelpTurnInput[], nowIso: string): MisconceptionSignal[] {
  const signals: MisconceptionSignal[] = [];
  const byStudentSkill = new Map<string, AiHelpTurnInput[]>();

  for (const turn of turns) {
    if (turn.mode && turn.mode !== "daytime_tutor" && turn.mode !== "mistake_recovery") continue;
    const key = `${turn.studentId}|${normalize(turn.subject)}|${normalize(turn.skillFocus)}`;
    const list = byStudentSkill.get(key) ?? [];
    list.push(turn);
    byStudentSkill.set(key, list);
  }

  for (const [, rows] of byStudentSkill) {
    const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let exhaustedWithoutLabel = 0;
    for (const turn of ordered) {
      const payload = parseDaytimeTutorPayload(turn.questionText);
      if (payload.misconception) {
        signals.push({
          studentId: turn.studentId,
          subject: turn.subject,
          skillFocus: turn.skillFocus ?? "general",
          source: "ai_help",
          text: payload.misconception,
          code: `ai:${normalize(turn.subject)}:${normalize(turn.skillFocus)}`,
          confidence: clampConfidence(payload.needsTeacher ? 0.75 : 0.55),
          evidenceRefs: [{ kind: "coach_interaction", id: turn.id }],
          detectedAt: turn.createdAt || nowIso,
          metadata: {
            needsTeacher: payload.needsTeacher,
            intent: payload.intent,
            source: payload.source,
            hintLevel: turn.hintLevel,
          },
        });
      } else if (payload.needsTeacher) {
        exhaustedWithoutLabel += 1;
      }
    }

    if (exhaustedWithoutLabel >= 1) {
      const latest = ordered[ordered.length - 1];
      const payload = parseDaytimeTutorPayload(latest.questionText);
      if (!payload.misconception && payload.needsTeacher) {
        signals.push({
          studentId: latest.studentId,
          subject: latest.subject,
          skillFocus: latest.skillFocus ?? "general",
          source: "ai_help",
          text: "AI help exhausted (needs teacher) without a labeled misconception.",
          code: `ai_exhaust:${normalize(latest.subject)}:${normalize(latest.skillFocus)}`,
          confidence: 0.5,
          evidenceRefs: ordered
            .filter((row) => parseDaytimeTutorPayload(row.questionText).needsTeacher)
            .slice(-3)
            .map((row) => ({ kind: "coach_interaction" as const, id: row.id })),
          detectedAt: latest.createdAt || nowIso,
          metadata: { exhaustedTurns: exhaustedWithoutLabel },
        });
      }
    }
  }

  return signals;
}

export function deriveHumanSessionSignals(
  sessions: HumanSessionInput[],
  nowIso: string,
): { signals: MisconceptionSignal[]; links: HumanOutcomeLink[] } {
  const signals: MisconceptionSignal[] = [];
  const links: HumanOutcomeLink[] = [];

  for (const session of sessions) {
    const meta = parseSessionMetadata(session.metadataJson);
    const snapshot = meta.supportContextSnapshot;
    const notesMisconception = meta.sessionNotes.misconception?.trim() || null;
    const snapshotMisconception = snapshot?.misconception?.trim() || null;
    const misconception = notesMisconception || snapshotMisconception;

    let remainingDifficulty: string | null = null;
    if (session.unresolvedReportJson) {
      try {
        const parsed = JSON.parse(session.unresolvedReportJson) as unknown;
        const validated = validateUnresolvedReport(parsed);
        if (validated.ok) remainingDifficulty = validated.report.remainingDifficulty;
      } catch {
        remainingDifficulty = null;
      }
    }

    const outcome = session.outcome ?? "unknown";
    links.push({
      sessionId: session.id,
      studentId: session.studentId,
      outcome,
      outcomeLabel: outcomeUiLabel(outcome),
      misconception,
      remainingDifficulty,
      endedAt: session.endedAt,
    });

    const subject = snapshot?.subject ?? "general";
    const skillFocus = snapshot?.curriculumSkill ?? snapshot?.stage ?? "human_support";
    const stage = snapshot?.stage ?? null;
    const detectedAt = session.endedAt ?? session.startedAt ?? nowIso;

    if (misconception) {
      signals.push({
        studentId: session.studentId,
        subject,
        skillFocus,
        stage,
        source: "human_notes",
        text: misconception,
        code: `human:${normalize(subject)}:${normalize(skillFocus)}`,
        confidence: notesMisconception ? 0.9 : 0.7,
        evidenceRefs: [{ kind: "human_support_session", id: session.id }],
        detectedAt,
        metadata: {
          outcome,
          outcomeLabel: outcomeUiLabel(outcome),
          fromNotes: Boolean(notesMisconception),
          fromSnapshot: Boolean(snapshotMisconception) && !notesMisconception,
        },
      });
    }

    if (remainingDifficulty) {
      signals.push({
        studentId: session.studentId,
        subject,
        skillFocus,
        stage,
        source: "unresolved_report",
        text: remainingDifficulty,
        code: `unresolved:${normalize(subject)}:${normalize(skillFocus)}`,
        confidence: 0.85,
        evidenceRefs: [
          { kind: "human_support_session", id: session.id },
          { kind: "unresolved_report", id: session.id },
        ],
        detectedAt,
        metadata: { outcome, outcomeLabel: outcomeUiLabel(outcome) },
      });
    } else if (
      (outcome === "partially_resolved" || outcome === "unresolved" || outcome === "escalated")
      && !misconception
    ) {
      signals.push({
        studentId: session.studentId,
        subject,
        skillFocus,
        stage,
        source: "human_notes",
        text: `Human support ended as ${outcomeUiLabel(outcome)} without a captured misconception label.`,
        code: `human_outcome:${outcome}`,
        confidence: 0.4,
        evidenceRefs: [{ kind: "human_support_session", id: session.id }],
        detectedAt,
        metadata: { outcome, outcomeLabel: outcomeUiLabel(outcome) },
      });
    }
  }

  return { signals, links };
}

export function deriveLearningDnaSignals(rows: LearningDnaInput[], nowIso: string): MisconceptionSignal[] {
  const signals: MisconceptionSignal[] = [];
  for (const row of rows) {
    const snapshot = extractLearningDnaFromProfileJson(row.aiLearningProfileJson);
    if (!snapshot) continue;
    for (const [key, count] of Object.entries(snapshot.recurringMistakes)) {
      if (count < DNA_MIN_COUNT) continue;
      const [subject = "general", skillFocus = "general", errorType = "incorrect"] = key.split(":");
      signals.push({
        studentId: row.studentId,
        subject,
        skillFocus,
        source: "learning_dna",
        text: `Recurring mistake pattern (${errorType}) seen ${count} times.`,
        code: `dna:${key}`,
        confidence: clampConfidence(0.4 + Math.min(0.45, count * 0.08)),
        evidenceRefs: [{ kind: "learning_dna", id: row.studentId }],
        detectedAt: snapshot.updatedAt || nowIso,
        metadata: { mistakeKey: key, count },
      });
    }
  }
  return signals;
}

export function deriveSpellingMistakeSignals(
  rows: SpellingMistakeInput[],
  nowIso: string,
): MisconceptionSignal[] {
  const signals: MisconceptionSignal[] = [];
  for (const row of rows) {
    const mistakeType = row.mistakeType?.trim();
    if (!mistakeType) continue;
    const accuracy = row.attempts > 0 ? row.correctCount / row.attempts : 0;
    if (row.attempts < 2 || accuracy >= 0.75) continue;
    if (normalize(row.status) === "mastered") continue;

    signals.push({
      studentId: row.studentId,
      subject: "spelling",
      skillFocus: row.word,
      source: "spelling_mistake",
      text: `Spelling mistake type "${mistakeType}" on "${row.word}".`,
      code: `spelling:${normalize(mistakeType)}:${normalize(row.word)}`,
      confidence: clampConfidence(0.5 + (1 - accuracy) * 0.3),
      evidenceRefs: [{ kind: "word_progress", id: row.id }],
      detectedAt: row.lastSeen || nowIso,
      metadata: {
        mistakeType,
        attempts: row.attempts,
        correctCount: row.correctCount,
        status: row.status,
      },
    });
  }
  return signals;
}

function countBySource(signals: MisconceptionSignal[]): MisconceptionSourceCount[] {
  const map = new Map<MisconceptionSignalSource, number>();
  for (const signal of signals) {
    map.set(signal.source, (map.get(signal.source) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

function topSkills(signals: MisconceptionSignal[], limit = 10): MisconceptionSkillBucket[] {
  const map = new Map<string, MisconceptionSkillBucket>();
  for (const signal of signals) {
    const key = `${normalize(signal.subject)}|${normalize(signal.skillFocus)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        subject: signal.subject,
        skillFocus: signal.skillFocus,
        signalCount: 1,
        sources: [signal.source],
        sampleText: signal.text,
      });
      continue;
    }
    existing.signalCount += 1;
    if (!existing.sources.includes(signal.source)) existing.sources.push(signal.source);
    if (!existing.sampleText && signal.text) existing.sampleText = signal.text;
  }
  return Array.from(map.values())
    .sort((a, b) => b.signalCount - a.signalCount || a.skillFocus.localeCompare(b.skillFocus))
    .slice(0, limit);
}

function buildStudentSummaries(
  signals: MisconceptionSignal[],
  links: HumanOutcomeLink[],
  studentNames?: Record<string, string>,
): MisconceptionStudentSummary[] {
  const byStudent = new Map<string, MisconceptionSignal[]>();
  for (const signal of signals) {
    const list = byStudent.get(signal.studentId) ?? [];
    list.push(signal);
    byStudent.set(signal.studentId, list);
  }

  const studentIds = new Set<string>([
    ...byStudent.keys(),
    ...links.map((link) => link.studentId),
  ]);

  return Array.from(studentIds)
    .map((studentId) => {
      const studentSignals = byStudent.get(studentId) ?? [];
      const studentLinks = links.filter((link) => link.studentId === studentId);
      return {
        studentId,
        studentName: studentNames?.[studentId] ?? null,
        signalCount: studentSignals.length,
        bySource: countBySource(studentSignals),
        topSkills: topSkills(studentSignals, 5),
        signals: studentSignals
          .slice()
          .sort((a, b) => b.confidence - a.confidence || b.detectedAt.localeCompare(a.detectedAt))
          .slice(0, 40),
        needsMonitoringSessionCount: studentLinks.filter((l) => l.outcome === "partially_resolved").length,
        unresolvedSessionCount: studentLinks.filter((l) => l.outcome === "unresolved").length,
        escalatedSessionCount: studentLinks.filter((l) => l.outcome === "escalated").length,
      };
    })
    .sort((a, b) => b.signalCount - a.signalCount || a.studentId.localeCompare(b.studentId));
}

export function aggregateMisconceptionAnalytics(
  input: AggregateMisconceptionInput,
): MisconceptionCohortSummary {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const windowDays = input.windowDays ?? 30;

  const attemptSignals = deriveAttemptPatternSignals(input.attempts, nowIso);
  const aiSignals = deriveAiHelpSignals(input.aiHelpTurns, nowIso);
  const { signals: humanSignals, links } = deriveHumanSessionSignals(input.humanSessions, nowIso);
  const dnaSignals = deriveLearningDnaSignals(input.learningDna, nowIso);
  const spellingSignals = deriveSpellingMistakeSignals(input.spellingMistakes, nowIso);

  const signals = [
    ...attemptSignals,
    ...aiSignals,
    ...humanSignals,
    ...dnaSignals,
    ...spellingSignals,
  ];

  const students = buildStudentSummaries(signals, links, input.studentNames);

  return {
    version: MISCONCEPTION_ANALYTICS_VERSION,
    generatedAt: nowIso,
    schoolId: input.schoolId ?? null,
    windowDays,
    studentCount: students.length,
    totalSignals: signals.length,
    bySource: countBySource(signals),
    topSkills: topSkills(signals, 15),
    students,
    humanOutcomeLinks: links
      .filter((link) =>
        link.outcome === "partially_resolved"
        || link.outcome === "unresolved"
        || link.outcome === "escalated"
        || Boolean(link.misconception)
        || Boolean(link.remainingDifficulty),
      )
      .slice(0, 100),
  };
}
