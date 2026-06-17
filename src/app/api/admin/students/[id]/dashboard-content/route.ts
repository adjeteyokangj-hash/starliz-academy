import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { applyCatchUpTaskAction } from "@/lib/academic-intelligence/catchUpTasks";
import { applyHomeworkTaskAction } from "@/lib/academic-intelligence/homeworkTasks";
import { listCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";
import { listHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import { writeAuditLog } from "@/lib/audit";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RemovalRequest = {
  contentType?: "assignment" | "catch_up" | "homework";
  itemId?: string;
};

const ADMIN_HIDDEN_NOTE = "__admin_removed__";

function normalizeId(value: string | undefined): string {
  return value?.trim() ?? "";
}

export async function GET(_request: Request, context: RouteContext) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;
  const studentId = normalizeId(id);
  if (!studentId) {
    return NextResponse.json({ error: "Student id is required." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, archived: false },
    select: { id: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const [assignments, catchUpTasks, homeworkTasks] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        studentId,
        status: { not: "archived" },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        content: {
          select: {
            id: true,
            contentType: true,
            topic: true,
            skillFocus: true,
            level: true,
          },
        },
      },
      take: 150,
    }),
    listCatchUpTasks(studentId),
    listHomeworkTasks(studentId),
  ]);

  return NextResponse.json({
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      status: assignment.status,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
      content: assignment.content,
    })),
    catchUpTasks,
    homeworkTasks,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;
  const studentId = normalizeId(id);
  if (!studentId) {
    return NextResponse.json({ error: "Student id is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as RemovalRequest | null;
  const contentType = body?.contentType;
  const itemId = normalizeId(body?.itemId);
  if (!contentType || !itemId) {
    return NextResponse.json({ error: "contentType and itemId are required." }, { status: 400 });
  }
  if (contentType !== "assignment" && contentType !== "catch_up" && contentType !== "homework") {
    return NextResponse.json({ error: "Invalid contentType." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, archived: false },
    select: { id: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  if (contentType === "assignment") {
    const result = await prisma.assignment.updateMany({
      where: {
        id: itemId,
        studentId,
        status: { not: "archived" },
      },
      data: {
        status: "archived",
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Assignment not found for this student." }, { status: 404 });
    }
  }

  if (contentType === "catch_up") {
    const task = await applyCatchUpTaskAction({
      studentId,
      taskId: itemId,
      action: "waive_catch_up",
      actorUserId: session.userId,
      note: ADMIN_HIDDEN_NOTE,
    });

    if (!task) {
      return NextResponse.json({ error: "Catch-up task not found for this student." }, { status: 404 });
    }
  }

  if (contentType === "homework") {
    const task = await applyHomeworkTaskAction({
      studentId,
      taskId: itemId,
      action: "waive_homework",
      actorUserId: session.userId,
      note: ADMIN_HIDDEN_NOTE,
    });

    if (!task) {
      return NextResponse.json({ error: "Homework task not found for this student." }, { status: 404 });
    }
  }

  await invalidateAcademicIntelligenceSnapshot({
    studentId,
    reason: "admin_assignment_update",
  }).catch(() => undefined);
  await writeAuditLog({
    actorUserId: session.userId,
    action: "admin_student_dashboard_content_removed",
    entityType: `student_dashboard_${contentType}`,
    entityId: itemId,
    metadata: {
      studentId,
      contentType,
      removedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({ ok: true });
}