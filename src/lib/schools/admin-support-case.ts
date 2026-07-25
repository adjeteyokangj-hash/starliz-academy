/**
 * Virtual support case id + timeline for Admin oversight.
 * Admin never becomes a tutor — read model only (private notes gated).
 */

import { prisma } from "@/lib/db";
import { parseSessionMetadata } from "@/lib/schools/human-support-session";
import { parseAdminFollowUp } from "@/lib/schools/admin-support-follow-up";
import { parseDaytimeTutorSkillFocus } from "@/lib/schools/live-classroom-signals";

export type AdminSupportCaseIdParts = {
  childId: string;
  periodId: string | null;
};

export type AdminSupportTimelineEvent = {
  at: string;
  kind: string;
  label: string;
  detail?: string | null;
  source: "coach" | "audit" | "queue" | "session" | "guidance" | "follow_up";
};

export function encodeAdminSupportCaseId(parts: AdminSupportCaseIdParts): string {
  return `${parts.childId}::${parts.periodId ?? ""}`;
}

export function parseAdminSupportCaseId(caseId: string): AdminSupportCaseIdParts | null {
  const raw = String(caseId ?? "").trim();
  if (!raw) return null;
  const sep = raw.indexOf("::");
  if (sep <= 0) return null;
  const childId = raw.slice(0, sep).trim();
  const periodIdRaw = raw.slice(sep + 2).trim();
  if (!childId) return null;
  return { childId, periodId: periodIdRaw || null };
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

function coachEventLabel(payload: Record<string, unknown> | null, mode: string): string {
  const source = typeof payload?.source === "string" ? payload.source : null;
  const needsTeacher = Boolean(payload?.needsTeacher);
  if (needsTeacher) return "AI exhausted / teacher required";
  if (source === "fallback") return "AI fallback";
  if (source === "openai") return "Live AI";
  if (source === "stored-help") return "Stored help";
  if (mode === "daytime_tutor") return "Student requested help";
  return "AI tutor interaction";
}

export async function getAdminSupportCaseTimeline(input: {
  schoolId: string;
  caseId: string;
  includePrivateNotes?: boolean;
  actorUserId?: string;
}): Promise<
  | {
      ok: true;
      caseId: string;
      childId: string;
      periodId: string | null;
      studentName: string;
      lessonTitle: string | null;
      subject: string | null;
      timeline: AdminSupportTimelineEvent[];
      session: {
        sessionId: string;
        status: string;
        outcome: string | null;
        budgetMinutes: number;
        plannedEndsAt: string | null;
        startedAt: string;
        endedAt: string | null;
        exceededBudget: boolean;
        privateNotes: string | null;
        misconception: string | null;
        unresolvedReport: unknown;
        followUp: ReturnType<typeof parseAdminFollowUp>;
        guidanceCount: number;
      } | null;
      queue: {
        queueEntryId: string;
        status: string;
        assignedTutorId: string | null;
        enqueuedAt: string;
      } | null;
    }
  | { ok: false; status: number; error: string }
> {
  const parts = parseAdminSupportCaseId(input.caseId);
  if (!parts) {
    return { ok: false, status: 400, error: "Invalid case id." };
  }

  const student = await prisma.schoolStudent.findFirst({
    where: {
      schoolId: input.schoolId,
      childId: parts.childId,
      status: "active",
    },
    select: { child: { select: { name: true } } },
  });
  if (!student) {
    return { ok: false, status: 404, error: "Student not found in this school." };
  }

  const period = parts.periodId
    ? await prisma.schoolDayLesson.findFirst({
        where: { id: parts.periodId, schoolId: input.schoolId },
        select: { id: true, title: true, subject: true },
      })
    : null;

  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const [coachLogs, audits, queueEntries, sessions] = await Promise.all([
    prisma.coachInteractionLog.findMany({
      where: {
        childId: parts.childId,
        createdAt: { gte: since },
        mode: { in: ["daytime_tutor", "mistake_recovery"] },
      },
      orderBy: { createdAt: "asc" },
      take: 80,
      select: {
        createdAt: true,
        mode: true,
        hintLevel: true,
        skillFocus: true,
        questionText: true,
      },
    }),
    prisma.schoolAuditLog.findMany({
      where: {
        schoolId: input.schoolId,
        createdAt: { gte: since },
        OR: [
          { entityId: parts.childId },
          ...(parts.periodId ? [{ entityId: parts.periodId }] : []),
          {
            action: {
              startsWith: "human_support_",
            },
            metadataJson: { contains: parts.childId },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        createdAt: true,
        action: true,
        entityType: true,
        entityId: true,
        metadataJson: true,
        severity: true,
      },
    }),
    prisma.humanSupportQueueEntry.findMany({
      where: {
        schoolId: input.schoolId,
        childId: parts.childId,
        ...(parts.periodId ? { periodId: parts.periodId } : {}),
      },
      orderBy: { enqueuedAt: "desc" },
      take: 5,
    }),
    prisma.humanSupportSession.findMany({
      where: {
        schoolId: input.schoolId,
        childId: parts.childId,
        ...(parts.periodId ? { periodId: parts.periodId } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
  ]);

  const timeline: AdminSupportTimelineEvent[] = [];

  for (const log of coachLogs) {
    if (parts.periodId) {
      const parsedFocus = parseDaytimeTutorSkillFocus(log.skillFocus);
      // Keep period-scoped logs when skillFocus encodes the period; otherwise include all recent.
      if (parsedFocus?.periodId && parsedFocus.periodId !== parts.periodId) continue;
    }
    const payload = parseJsonObject(log.questionText);
    timeline.push({
      at: log.createdAt.toISOString(),
      kind: "ai_help",
      label: coachEventLabel(payload, log.mode),
      detail: typeof payload?.intent === "string" ? payload.intent : null,
      source: "coach",
    });
  }

  for (const audit of audits) {
    timeline.push({
      at: audit.createdAt.toISOString(),
      kind: audit.action,
      label: audit.action.replace(/_/g, " "),
      detail: null,
      source: "audit",
    });
  }

  for (const entry of queueEntries) {
    timeline.push({
      at: entry.enqueuedAt.toISOString(),
      kind: `queue_${entry.status}`,
      label: `Queue ${entry.status.replace(/_/g, " ")}`,
      detail: entry.assignedTutorId ? `Assigned tutor ${entry.assignedTutorId}` : null,
      source: "queue",
    });
    if (entry.assignedAt) {
      timeline.push({
        at: entry.assignedAt.toISOString(),
        kind: "queue_assigned_at",
        label: "Tutor assigned",
        detail: entry.assignedTutorId,
        source: "queue",
      });
    }
  }

  let privateNotes: string | null = null;
  let misconception: string | null = null;
  let guidanceCount = 0;
  let unresolvedReport: unknown = null;
  let followUp = null as ReturnType<typeof parseAdminFollowUp>;

  const latestSession = sessions[0] ?? null;
  if (latestSession) {
    const meta = parseSessionMetadata(latestSession.metadataJson);
    guidanceCount = meta.guidanceMessages.length;
    misconception = meta.sessionNotes.misconception ?? null;
    followUp = parseAdminFollowUp(latestSession.metadataJson);
    if (latestSession.unresolvedReportJson) {
      try {
        unresolvedReport = JSON.parse(latestSession.unresolvedReportJson);
      } catch {
        unresolvedReport = null;
      }
    }
    if (input.includePrivateNotes) {
      privateNotes = meta.sessionNotes.privateNotes || null;
    }

    timeline.push({
      at: latestSession.startedAt.toISOString(),
      kind: "session_started",
      label: "Tutor accepted / session started",
      detail: `Budget ${latestSession.budgetMinutes} min`,
      source: "session",
    });

    for (const msg of meta.guidanceMessages) {
      timeline.push({
        at: msg.createdAt,
        kind: "guidance_sent",
        label: "Guidance sent",
        detail: input.includePrivateNotes ? msg.text.slice(0, 200) : "Guidance message",
        source: "guidance",
      });
    }

    if (latestSession.endedAt) {
      timeline.push({
        at: latestSession.endedAt.toISOString(),
        kind: "session_ended",
        label: latestSession.outcome
          ? `Outcome: ${latestSession.outcome.replace(/_/g, " ")}`
          : "Session ended",
        detail: latestSession.outcomeNotes,
        source: "session",
      });
      if (latestSession.outcome && latestSession.outcome !== "disconnected") {
        timeline.push({
          at: latestSession.endedAt.toISOString(),
          kind: "returned_to_lesson",
          label: "Returned to lesson",
          detail: null,
          source: "session",
        });
      }
    }

    if (followUp) {
      timeline.push({
        at: followUp.updatedAt,
        kind: `follow_up_${followUp.status}`,
        label: `Follow-up ${followUp.status.replace(/_/g, " ")}`,
        detail: followUp.adminNote,
        source: "follow_up",
      });
    }
  }

  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const latestQueue = queueEntries[0] ?? null;

  return {
    ok: true,
    caseId: encodeAdminSupportCaseId(parts),
    childId: parts.childId,
    periodId: parts.periodId,
    studentName: student.child.name,
    lessonTitle: period?.title ?? null,
    subject: period?.subject ?? null,
    timeline,
    session: latestSession
      ? {
          sessionId: latestSession.id,
          status: latestSession.status,
          outcome: latestSession.outcome,
          budgetMinutes: latestSession.budgetMinutes,
          plannedEndsAt: latestSession.plannedEndsAt?.toISOString() ?? null,
          startedAt: latestSession.startedAt.toISOString(),
          endedAt: latestSession.endedAt?.toISOString() ?? null,
          exceededBudget: latestSession.exceededBudget,
          privateNotes,
          misconception,
          unresolvedReport,
          followUp,
          guidanceCount,
        }
      : null,
    queue: latestQueue
      ? {
          queueEntryId: latestQueue.id,
          status: latestQueue.status,
          assignedTutorId: latestQueue.assignedTutorId,
          enqueuedAt: latestQueue.enqueuedAt.toISOString(),
        }
      : null,
  };
}
