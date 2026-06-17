import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import type {
  AcademicPriority,
  CatchUpRecommendation,
  CatchUpStatus,
  CatchUpTaskAction,
  CatchUpTaskRecord,
  CatchUpTriggerType,
  SchoolWeekModePlan,
} from "@/lib/academic-intelligence/types";

const TASK_ENTITY_TYPE = "academic_catch_up_task";
const ADMIN_HIDDEN_NOTE = "__admin_removed__";

type PersistedCatchUpTaskMetadata = {
  taskId: string;
  studentId: string;
  recommendationId: string;
  title: string;
  subject: string;
  topic?: string | null;
  skill?: string | null;
  status: CatchUpStatus;
  priority: AcademicPriority;
  estimatedMinutes: number;
  dueDate?: string | null;
  scheduledDay?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null;
  routeTarget?: string | null;
  sourceTrigger: CatchUpTriggerType;
  note?: string | null;
  metadata?: Record<string, unknown>;
};

function asObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStatus(value: unknown): CatchUpStatus | null {
  if (
    value === "recommended"
    || value === "scheduled"
    || value === "active"
    || value === "in_progress"
    || value === "completed"
    || value === "skipped"
    || value === "waived"
    || value === "overdue"
  ) return value;
  return null;
}

function asPriority(value: unknown): AcademicPriority {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function asSourceTrigger(value: unknown): CatchUpTriggerType {
  if (
    value === "unfinished_lesson"
    || value === "unfinished_assignment"
    || value === "missed_activity"
    || value === "missed_homework"
    || value === "low_quiz_score"
    || value === "low_attempt_score"
    || value === "repeated_wrong_answers"
    || value === "active_weak_area"
    || value === "misconception_marker"
    || value === "difficult_dictionary_term"
    || value === "high_coach_usage"
    || value === "high_hint_usage"
    || value === "overdue_revision"
    || value === "gcse_coverage_gap"
    || value === "topic_not_practised_recently"
    || value === "assessment_below_readiness"
  ) return value;
  return "active_weak_area";
}

function toTaskRecord(row: {
  entityId: string | null;
  metadataJson: string | null;
  createdAt: Date;
}): CatchUpTaskRecord | null {
  const data = asObject(row.metadataJson);
  if (!data) return null;

  const taskId = asString(data.taskId) ?? row.entityId;
  const studentId = asString(data.studentId);
  const recommendationId = asString(data.recommendationId);
  const title = asString(data.title);
  const subject = asString(data.subject);
  const status = asStatus(data.status);
  const sourceTrigger = asSourceTrigger(data.sourceTrigger);

  if (!taskId || !studentId || !recommendationId || !title || !subject || !status) return null;

  const estimatedMinutes = typeof data.estimatedMinutes === "number" && Number.isFinite(data.estimatedMinutes)
    ? Math.max(1, Math.round(data.estimatedMinutes))
    : 15;

  const dueDate = asString(data.dueDate);
  const overdue = dueDate
    && new Date(dueDate).getTime() < Date.now()
    && (status === "recommended" || status === "scheduled" || status === "active" || status === "in_progress");

  const scheduledDay = asString(data.scheduledDay);
  const normalizedDay = scheduledDay === "Monday"
    || scheduledDay === "Tuesday"
    || scheduledDay === "Wednesday"
    || scheduledDay === "Thursday"
    || scheduledDay === "Friday"
    ? scheduledDay
    : null;

  return {
    taskId,
    studentId,
    recommendationId,
    title,
    subject,
    topic: asString(data.topic),
    skill: asString(data.skill),
    status: overdue ? "overdue" : status,
    priority: asPriority(data.priority),
    estimatedMinutes,
    dueDate,
    scheduledDay: normalizedDay,
    routeTarget: asString(data.routeTarget),
    sourceTrigger,
    note: asString(data.note),
    metadata: data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
  };
}

function dayByRecommendationId(plan: SchoolWeekModePlan): Map<string, "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday"> {
  const map = new Map<string, "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday">();
  for (const day of plan.days) {
    if (day.recommendationId) map.set(day.recommendationId, day.day);
  }
  return map;
}

export async function listCatchUpTasks(studentId: string, options?: { includeHidden?: boolean }): Promise<CatchUpTaskRecord[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      entityType: TASK_ENTITY_TYPE,
      metadataJson: {
        contains: `\"studentId\":\"${studentId}\"`,
      },
    },
    select: {
      entityId: true,
      metadataJson: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const latest = new Map<string, CatchUpTaskRecord>();
  const hiddenTaskIds = new Set<string>();
  for (const row of rows) {
    const parsed = toTaskRecord(row);
    if (!parsed) continue;
    if (!options?.includeHidden && parsed.note === ADMIN_HIDDEN_NOTE) {
      hiddenTaskIds.add(parsed.taskId);
      continue;
    }
    if (!options?.includeHidden && hiddenTaskIds.has(parsed.taskId)) continue;
    if (!latest.has(parsed.taskId)) latest.set(parsed.taskId, parsed);
  }

  return Array.from(latest.values()).sort((left, right) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 } as const;
    const byPriority = priorityOrder[right.priority] - priorityOrder[left.priority];
    if (byPriority !== 0) return byPriority;
    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue;
  });
}

export async function syncCatchUpTasks(input: {
  studentId: string;
  recommendations: CatchUpRecommendation[];
  schoolWeekModePlan: SchoolWeekModePlan;
  actorUserId?: string;
}): Promise<CatchUpTaskRecord[]> {
  const existing = await listCatchUpTasks(input.studentId, { includeHidden: true });
  const existingByRecommendation = new Map(existing.map((task) => [task.recommendationId, task]));
  const dayIndex = dayByRecommendationId(input.schoolWeekModePlan);

  for (const recommendation of input.recommendations) {
    const existingTask = existingByRecommendation.get(recommendation.id);
    const preservedTerminal = existingTask && (existingTask.status === "completed" || existingTask.status === "waived" || existingTask.status === "skipped");

    const status: CatchUpStatus = preservedTerminal
      ? existingTask.status
      : existingTask?.status ?? (recommendation.priority === "high" ? "scheduled" : "recommended");

    const scheduledDay = existingTask?.scheduledDay ?? dayIndex.get(recommendation.id) ?? null;
    const dueDate = existingTask?.dueDate ?? recommendation.dueDate ?? null;
    const taskId = existingTask?.taskId ?? `catch-up-${recommendation.id}`;

    const metadata: PersistedCatchUpTaskMetadata = {
      taskId,
      studentId: input.studentId,
      recommendationId: recommendation.id,
      title: recommendation.title,
      subject: recommendation.subject,
      topic: recommendation.topic,
      skill: recommendation.skill,
      status,
      priority: recommendation.priority,
      estimatedMinutes: recommendation.estimatedMinutes,
      dueDate,
      scheduledDay,
      routeTarget: recommendation.routeTarget ?? null,
      sourceTrigger: recommendation.sourceTrigger,
      note: existingTask?.note ?? null,
      metadata: {
        taskType: recommendation.taskType,
        recommendedAction: recommendation.recommendedAction,
      },
    };

    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: existingTask ? "academic_catch_up_task_refreshed" : "academic_catch_up_task_created",
      entityType: TASK_ENTITY_TYPE,
      entityId: taskId,
      metadata,
    });
  }

  return listCatchUpTasks(input.studentId);
}

export async function applyCatchUpTaskAction(input: {
  studentId: string;
  taskId: string;
  action: CatchUpTaskAction;
  actorUserId?: string;
  dueDate?: string | null;
  scheduledDay?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | null;
  note?: string | null;
}): Promise<CatchUpTaskRecord | null> {
  const tasks = await listCatchUpTasks(input.studentId, { includeHidden: true });
  const existing = tasks.find((task) => task.taskId === input.taskId);
  if (!existing) return null;

  let nextStatus: CatchUpStatus = existing.status;
  if (input.action === "approve_catch_up") nextStatus = existing.status === "overdue" ? "scheduled" : "active";
  if (input.action === "reschedule_catch_up") nextStatus = "scheduled";
  if (input.action === "convert_to_homework") nextStatus = "active";
  if (input.action === "waive_catch_up") nextStatus = "waived";
  if (input.action === "start_task") nextStatus = "in_progress";
  if (input.action === "complete_task") nextStatus = "completed";
  if (input.action === "skip_task") nextStatus = "skipped";

  const metadata: PersistedCatchUpTaskMetadata = {
    taskId: existing.taskId,
    studentId: existing.studentId,
    recommendationId: existing.recommendationId,
    title: existing.title,
    subject: existing.subject,
    topic: existing.topic,
    skill: existing.skill,
    status: nextStatus,
    priority: existing.priority,
    estimatedMinutes: existing.estimatedMinutes,
    dueDate: input.dueDate ?? existing.dueDate ?? null,
    scheduledDay: input.scheduledDay ?? existing.scheduledDay ?? null,
    routeTarget: existing.routeTarget ?? null,
    sourceTrigger: existing.sourceTrigger,
    note: input.note ?? existing.note ?? null,
    metadata: {
      ...(existing.metadata ?? {}),
      lastAction: input.action,
      actionAt: new Date().toISOString(),
    },
  };

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: `academic_catch_up_task_${input.action}`,
    entityType: TASK_ENTITY_TYPE,
    entityId: existing.taskId,
    metadata,
  });

  const updated = await listCatchUpTasks(input.studentId, { includeHidden: true });
  return updated.find((task) => task.taskId === existing.taskId) ?? null;
}

export function buildTaskStatusMap(tasks: CatchUpTaskRecord[]): Record<string, CatchUpStatus> {
  const map: Record<string, CatchUpStatus> = {};
  for (const task of tasks) map[task.recommendationId] = task.status;
  return map;
}

export function buildTaskDueDateMap(tasks: CatchUpTaskRecord[]): Record<string, string | null | undefined> {
  const map: Record<string, string | null | undefined> = {};
  for (const task of tasks) map[task.recommendationId] = task.dueDate;
  return map;
}
