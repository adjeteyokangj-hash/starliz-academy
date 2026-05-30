import { prisma } from "@/lib/db";
import type { CoachHeartbeatSignalSummary } from "@/lib/academic-intelligence/types";

type CoachHeartbeatSignalMetadata = {
  subject: string | null;
  strand: string | null;
  skillTopic: string | null;
  yearGroup: string | null;
  questionId: string | null;
  lessonItemId: string | null;
  understoodAfterHelp: boolean;
  stillStruggling: boolean;
  repeatedWeakArea: boolean;
  needsCatchUp: boolean;
  needsDifferentExplanationStyle: boolean;
  needsLiveTutorSupport: boolean;
};

type SignalRow = {
  metadataJson: string | null;
  createdAt: Date;
};

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function emptySummary(windowDays: number): CoachHeartbeatSignalSummary {
  return {
    windowDays,
    totalCoachSignals: 0,
    understoodAfterHelpCount: 0,
    stillStrugglingCount: 0,
    repeatedWeakAreaCount: 0,
    needsCatchUpCount: 0,
    needsDifferentExplanationStyleCount: 0,
    needsLiveTutorSupportCount: 0,
    topSubjects: [],
    topStrands: [],
    topSkillTopics: [],
    latestSignalAt: null,
    hasCoachConcern: false,
    hasTutorEscalationSignal: false,
    hasCatchUpSignal: false,
  };
}

function parseCoachHeartbeatMetadata(raw: string | null | undefined): CoachHeartbeatSignalMetadata | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      subject: asStringOrNull(parsed.subject),
      strand: asStringOrNull(parsed.strand),
      skillTopic: asStringOrNull(parsed.skillTopic),
      yearGroup: asStringOrNull(parsed.yearGroup),
      questionId: asStringOrNull(parsed.questionId),
      lessonItemId: asStringOrNull(parsed.lessonItemId),
      understoodAfterHelp: asBoolean(parsed.understoodAfterHelp),
      stillStruggling: asBoolean(parsed.stillStruggling),
      repeatedWeakArea: asBoolean(parsed.repeatedWeakArea),
      needsCatchUp: asBoolean(parsed.needsCatchUp),
      needsDifferentExplanationStyle: asBoolean(parsed.needsDifferentExplanationStyle),
      needsLiveTutorSupport: asBoolean(parsed.needsLiveTutorSupport),
    };
  } catch {
    return null;
  }
}

function topNFromMap(values: Map<string, { value: string; count: number }>, limit: number): Array<{ value: string; count: number }> {
  return Array.from(values.values())
    .sort((left, right) => {
      const byCount = right.count - left.count;
      if (byCount !== 0) return byCount;
      return left.value.localeCompare(right.value);
    })
    .slice(0, limit);
}

function incrementCounter(map: Map<string, { value: string; count: number }>, value: string | null): void {
  const normalized = normalizeKey(value);
  if (!normalized) return;
  const existing = map.get(normalized);
  if (existing) {
    existing.count += 1;
    return;
  }
  map.set(normalized, { value: value as string, count: 1 });
}

export function summarizeCoachHeartbeatSignals(rows: SignalRow[], windowDays: number): CoachHeartbeatSignalSummary {
  const summary = emptySummary(windowDays);
  const subjectMap = new Map<string, { value: string; count: number }>();
  const strandMap = new Map<string, { value: string; count: number }>();
  const skillTopicMap = new Map<string, { value: string; count: number }>();

  for (const row of rows) {
    const metadata = parseCoachHeartbeatMetadata(row.metadataJson);
    if (!metadata) continue;

    summary.totalCoachSignals += 1;
    if (metadata.understoodAfterHelp) summary.understoodAfterHelpCount += 1;
    if (metadata.stillStruggling) summary.stillStrugglingCount += 1;
    if (metadata.repeatedWeakArea) summary.repeatedWeakAreaCount += 1;
    if (metadata.needsCatchUp) summary.needsCatchUpCount += 1;
    if (metadata.needsDifferentExplanationStyle) summary.needsDifferentExplanationStyleCount += 1;
    if (metadata.needsLiveTutorSupport) summary.needsLiveTutorSupportCount += 1;

    incrementCounter(subjectMap, metadata.subject);
    incrementCounter(strandMap, metadata.strand);
    incrementCounter(skillTopicMap, metadata.skillTopic);

    const createdAtIso = row.createdAt.toISOString();
    if (!summary.latestSignalAt || createdAtIso > summary.latestSignalAt) {
      summary.latestSignalAt = createdAtIso;
    }
  }

  summary.topSubjects = topNFromMap(subjectMap, 3);
  summary.topStrands = topNFromMap(strandMap, 3);
  summary.topSkillTopics = topNFromMap(skillTopicMap, 3);
  summary.hasTutorEscalationSignal = summary.needsLiveTutorSupportCount >= 2;
  summary.hasCatchUpSignal = summary.needsCatchUpCount > 0;
  summary.hasCoachConcern = (
    summary.stillStrugglingCount > 0
    || summary.repeatedWeakAreaCount > 0
    || summary.needsCatchUpCount > 0
    || summary.needsDifferentExplanationStyleCount > 0
    || summary.needsLiveTutorSupportCount > 0
  );

  return summary;
}

export async function getCoachHeartbeatSignals(studentId: string, options?: {
  windowDays?: number;
  now?: Date;
}): Promise<CoachHeartbeatSignalSummary> {
  const windowDays = options?.windowDays ?? 14;
  const now = options?.now ?? new Date();
  const since = new Date(now);
  since.setUTCDate(now.getUTCDate() - windowDays);

  const rows = await prisma.auditLog.findMany({
    where: {
      action: "heartbeat.signal.updated",
      createdAt: { gte: since },
      OR: [
        { entityType: "StudentSignal", entityId: studentId },
        { entityId: studentId },
      ],
    },
    select: {
      metadataJson: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return summarizeCoachHeartbeatSignals(rows, windowDays);
}
