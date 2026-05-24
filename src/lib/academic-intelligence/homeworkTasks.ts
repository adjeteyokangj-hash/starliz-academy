import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import type {
  HomeworkStatus,
  HomeworkTaskAction,
  HomeworkTaskRecord,
  SchoolWeekModePlan,
  SchoolWeekday,
} from "@/lib/academic-intelligence/types";

const TASK_ENTITY_TYPE = "academic_homework_task";

type PersistedHomeworkMetadata = {
  taskId: string;
  studentId: string;
  blockId: string;
  title: string;
  subject?: string | null;
  topic?: string | null;
  status: HomeworkStatus;
  estimatedMinutes: number;
  dueDate?: string | null;
  scheduledDay?: SchoolWeekday | null;
  routeTarget?: string | null;
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

function asStatus(value: unknown): HomeworkStatus {
  if (value === "assigned" || value === "in_progress" || value === "completed" || value === "waived" || value === "overdue") {
    return value;
  }
  return "assigned";
}

function asDay(value: unknown): SchoolWeekday | null {
  if (value === "Monday" || value === "Tuesday" || value === "Wednesday" || value === "Thursday" || value === "Friday") {
    return value;
  }
  return null;
}

function toTaskRecord(row: {
  entityId: string | null;
  metadataJson: string | null;
  createdAt: Date;
}): HomeworkTaskRecord | null {
  const data = asObject(row.metadataJson);
  if (!data) return null;

  const taskId = asString(data.taskId) ?? row.entityId;
  const studentId = asString(data.studentId);
  const blockId = asString(data.blockId);
  const title = asString(data.title);
  if (!taskId || !studentId || !blockId || !title) return null;

  const estimatedMinutes = typeof data.estimatedMinutes === "number" && Number.isFinite(data.estimatedMinutes)
    ? Math.max(5, Math.round(data.estimatedMinutes))
    : 20;

  const dueDate = asString(data.dueDate);
  const currentStatus = asStatus(data.status);
  const overdue = dueDate
    && new Date(dueDate).getTime() < Date.now()
    && (currentStatus === "assigned" || currentStatus === "in_progress");

  return {
    taskId,
    studentId,
    blockId,
    title,
    subject: asString(data.subject),
    topic: asString(data.topic),
    status: overdue ? "overdue" : currentStatus,
    estimatedMinutes,
    dueDate,
    scheduledDay: asDay(data.scheduledDay),
    routeTarget: asString(data.routeTarget),
    note: asString(data.note),
    metadata: data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
  };
}

function dayOrder(day: SchoolWeekday): number {
  return day === "Monday" ? 1 : day === "Tuesday" ? 2 : day === "Wednesday" ? 3 : day === "Thursday" ? 4 : 5;
}

function nextDateForDay(day: SchoolWeekday): Date {
  const now = new Date();
  const current = now.getDay();
  const target = dayOrder(day);
  const normalizedCurrent = current === 0 ? 7 : current;
  let delta = target - normalizedCurrent;
  if (delta < 0) delta += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + delta);
  next.setHours(18, 0, 0, 0);
  return next;
}

export async function listHomeworkTasks(studentId: string): Promise<HomeworkTaskRecord[]> {
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

  const latest = new Map<string, HomeworkTaskRecord>();
  for (const row of rows) {
    const parsed = toTaskRecord(row);
    if (!parsed) continue;
    if (!latest.has(parsed.taskId)) latest.set(parsed.taskId, parsed);
  }

  return Array.from(latest.values()).sort((left, right) => {
    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue;
  });
}

export async function syncHomeworkTasks(input: {
  studentId: string;
  schoolWeekModePlan: SchoolWeekModePlan;
  actorUserId?: string;
}): Promise<HomeworkTaskRecord[]> {
  const existing = await listHomeworkTasks(input.studentId);
  const existingByBlock = new Map(existing.map((task) => [task.blockId, task]));

  for (const day of input.schoolWeekModePlan.dailySchedules) {
    for (const block of day.blocks) {
      if (block.activityType !== "homework") continue;

      const existingTask = existingByBlock.get(block.blockId);
      const preservedTerminal = existingTask && (existingTask.status === "completed" || existingTask.status === "waived");
      const status: HomeworkStatus = preservedTerminal ? existingTask.status : (existingTask?.status ?? "assigned");
      const dueDate = existingTask?.dueDate ?? nextDateForDay(day.day).toISOString();
      const taskId = existingTask?.taskId ?? `homework-${block.blockId}`;

      const metadata: PersistedHomeworkMetadata = {
        taskId,
        studentId: input.studentId,
        blockId: block.blockId,
        title: block.title,
        subject: block.subject,
        topic: block.topic,
        status,
        estimatedMinutes: block.estimatedMinutes,
        dueDate,
        scheduledDay: day.day,
        routeTarget: block.routeTarget,
        note: existingTask?.note ?? null,
        metadata: {
          friendlyLabel: block.friendlyLabel,
        },
      };

      await writeAuditLog({
        actorUserId: input.actorUserId,
        action: existingTask ? "academic_homework_task_refreshed" : "academic_homework_task_created",
        entityType: TASK_ENTITY_TYPE,
        entityId: taskId,
        metadata,
      });
    }
  }

  return listHomeworkTasks(input.studentId);
}

export async function applyHomeworkTaskAction(input: {
  studentId: string;
  taskId: string;
  action: HomeworkTaskAction;
  actorUserId?: string;
  dueDate?: string | null;
  note?: string | null;
}): Promise<HomeworkTaskRecord | null> {
  const tasks = await listHomeworkTasks(input.studentId);
  const existing = tasks.find((task) => task.taskId === input.taskId);
  if (!existing) return null;

  let nextStatus: HomeworkStatus = existing.status;
  if (input.action === "start_homework") nextStatus = "in_progress";
  if (input.action === "complete_homework") nextStatus = "completed";
  if (input.action === "waive_homework") nextStatus = "waived";
  if (input.action === "reschedule_homework") nextStatus = existing.status === "overdue" ? "assigned" : existing.status;

  const metadata: PersistedHomeworkMetadata = {
    taskId: existing.taskId,
    studentId: existing.studentId,
    blockId: existing.blockId,
    title: existing.title,
    subject: existing.subject,
    topic: existing.topic,
    status: nextStatus,
    estimatedMinutes: existing.estimatedMinutes,
    dueDate: input.dueDate ?? existing.dueDate ?? null,
    scheduledDay: existing.scheduledDay,
    routeTarget: existing.routeTarget ?? null,
    note: input.note ?? existing.note ?? null,
    metadata: {
      ...(existing.metadata ?? {}),
      lastAction: input.action,
      actionAt: new Date().toISOString(),
    },
  };

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: `academic_homework_task_${input.action}`,
    entityType: TASK_ENTITY_TYPE,
    entityId: existing.taskId,
    metadata,
  });

  const updated = await listHomeworkTasks(input.studentId);
  return updated.find((task) => task.taskId === existing.taskId) ?? null;
}
