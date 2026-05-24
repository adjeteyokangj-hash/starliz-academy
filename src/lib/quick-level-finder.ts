export type QuickLevelFinderStatus = "in_progress" | "completed";

export type QuickLevelFinderQuestion = {
  id: string;
  subject: string;
};

export type QuickLevelFinderResponse = {
  questionId: string;
  subject: string;
  correct: boolean;
  timeSpentMs: number;
  answeredAt: string;
};

export type QuickLevelFinderLevel = {
  accuracy: number;
  level: "below" | "secure" | "advanced";
};

export type QuickLevelFinderSession = {
  sessionId: string;
  status: QuickLevelFinderStatus;
  startedAt: string;
  completedAt: string | null;
  selectedSubjects: string[];
  scopedSubjects: string[];
  questions: QuickLevelFinderQuestion[];
  cursor: number;
  responses: QuickLevelFinderResponse[];
  levels: Record<string, QuickLevelFinderLevel>;
};

function parseObject(raw: string | null | undefined): Record<string, unknown> {
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseQuestion(value: unknown): QuickLevelFinderQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const subject = typeof raw.subject === "string" ? raw.subject.trim().toLowerCase() : "";
  if (!id || !subject) return null;
  return { id, subject };
}

function parseResponse(value: unknown): QuickLevelFinderResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const questionId = typeof raw.questionId === "string" ? raw.questionId.trim() : "";
  const subject = typeof raw.subject === "string" ? raw.subject.trim().toLowerCase() : "";
  if (!questionId || !subject) return null;

  const correct = Boolean(raw.correct);
  const timeSpentMs = typeof raw.timeSpentMs === "number" && Number.isFinite(raw.timeSpentMs)
    ? Math.max(0, Math.floor(raw.timeSpentMs))
    : 0;
  const answeredAt = typeof raw.answeredAt === "string" && raw.answeredAt.trim()
    ? raw.answeredAt
    : new Date().toISOString();

  return {
    questionId,
    subject,
    correct,
    timeSpentMs,
    answeredAt,
  };
}

function parseLevels(value: unknown): Record<string, QuickLevelFinderLevel> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, QuickLevelFinderLevel> = {};
  for (const [subject, levelValue] of Object.entries(value)) {
    if (!subject.trim()) continue;
    if (!levelValue || typeof levelValue !== "object" || Array.isArray(levelValue)) continue;
    const levelObj = levelValue as Record<string, unknown>;
    const accuracyRaw = levelObj.accuracy;
    const levelRaw = levelObj.level;
    const accuracy = typeof accuracyRaw === "number" && Number.isFinite(accuracyRaw)
      ? Math.max(0, Math.min(100, Math.round(accuracyRaw)))
      : 0;
    if (levelRaw !== "below" && levelRaw !== "secure" && levelRaw !== "advanced") continue;
    out[subject.trim().toLowerCase()] = { accuracy, level: levelRaw };
  }
  return out;
}

export function parseQuickLevelFinderSession(raw: string | null | undefined): QuickLevelFinderSession | null {
  const profile = parseObject(raw);
  const quick = profile.quickLevelFinder;
  if (!quick || typeof quick !== "object" || Array.isArray(quick)) return null;

  const value = quick as Record<string, unknown>;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId.trim() : "";
  const status = value.status === "completed" ? "completed" : value.status === "in_progress" ? "in_progress" : null;
  const startedAt = typeof value.startedAt === "string" && value.startedAt.trim()
    ? value.startedAt
    : new Date().toISOString();
  const completedAt = typeof value.completedAt === "string" && value.completedAt.trim() ? value.completedAt : null;
  const selectedSubjects = asStringArray(value.selectedSubjects);
  const scopedSubjects = asStringArray(value.scopedSubjects);
  const questions = Array.isArray(value.questions)
    ? value.questions.map(parseQuestion).filter((item): item is QuickLevelFinderQuestion => item !== null)
    : [];
  const responses = Array.isArray(value.responses)
    ? value.responses.map(parseResponse).filter((item): item is QuickLevelFinderResponse => item !== null)
    : [];
  const levels = parseLevels(value.levels);
  const cursorRaw = typeof value.cursor === "number" && Number.isFinite(value.cursor) ? Math.floor(value.cursor) : 0;
  const cursor = Math.max(0, Math.min(questions.length, cursorRaw));

  if (!sessionId || !status || !questions.length || !selectedSubjects.length) return null;

  return {
    sessionId,
    status,
    startedAt,
    completedAt,
    selectedSubjects,
    scopedSubjects,
    questions,
    cursor,
    responses,
    levels,
  };
}

export function upsertQuickLevelFinderSession(
  existingJson: string | null | undefined,
  session: QuickLevelFinderSession,
): string {
  const profile = parseObject(existingJson);
  const next = {
    ...profile,
    quickLevelFinder: session,
  };
  return JSON.stringify(next);
}

export function questionRangeBySubjectCount(count: number): { min: number; max: number } {
  if (count <= 3) return { min: 18, max: 24 };
  if (count === 4) return { min: 24, max: 32 };
  return { min: 25, max: 35 };
}

export function buildQuestionPlan(scopedSubjects: string[], count: number): QuickLevelFinderQuestion[] {
  if (!scopedSubjects.length || count <= 0) return [];
  const questions: QuickLevelFinderQuestion[] = [];
  for (let index = 0; index < count; index += 1) {
    const subject = scopedSubjects[index % scopedSubjects.length];
    questions.push({
      id: `qlf-q-${index + 1}`,
      subject,
    });
  }
  return questions;
}

function levelFromAccuracy(accuracy: number): "below" | "secure" | "advanced" {
  if (accuracy >= 80) return "advanced";
  if (accuracy >= 55) return "secure";
  return "below";
}

export function deriveQuickLevelFinderLevels(session: Pick<QuickLevelFinderSession, "responses" | "scopedSubjects">): Record<string, QuickLevelFinderLevel> {
  const aggregate: Record<string, { total: number; correct: number }> = {};

  for (const subject of session.scopedSubjects) {
    aggregate[subject] = { total: 0, correct: 0 };
  }

  for (const response of session.responses) {
    const subject = response.subject;
    if (!aggregate[subject]) {
      aggregate[subject] = { total: 0, correct: 0 };
    }
    aggregate[subject].total += 1;
    if (response.correct) {
      aggregate[subject].correct += 1;
    }
  }

  const levels: Record<string, QuickLevelFinderLevel> = {};
  for (const [subject, stats] of Object.entries(aggregate)) {
    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    levels[subject] = {
      accuracy,
      level: levelFromAccuracy(accuracy),
    };
  }

  return levels;
}

export function quickLevelFinderPlacementCompleted(raw: string | null | undefined): boolean {
  const session = parseQuickLevelFinderSession(raw);
  return session?.status === "completed";
}

export function quickLevelFinderResponseCount(raw: string | null | undefined): number {
  const session = parseQuickLevelFinderSession(raw);
  return session?.responses.length ?? 0;
}
