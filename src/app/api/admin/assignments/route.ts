import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { keyStageForYearGroup, normalizeExamBoard } from "@/lib/curriculum";
import {
  assignContentToStudent,
  AssignmentSafetyError,
  DuplicateAssignmentError,
  SchoolLicenceAccessError,
} from "@/lib/assignments";
import { mergeWeakAreas, parseWeakAreaMetadata } from "@/lib/weakAreas";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";

const assignmentSchema = z.object({
  contentId: z.string().min(1),
  studentId: z.string().min(1).optional(),
  studentIds: z.array(z.string().min(1)).optional(),
  yearGroup: z.string().trim().optional(),
  dueDate: z.string().optional(),
  repeatMode: z.string().optional(),
  resend: z.boolean().optional(),
});

const assignmentStatusSchema = z.object({
  assignmentId: z.string().min(1),
  status: z.enum(["assigned", "in_progress", "completed", "archived"]),
});

function parseContentMetadata(raw: string | null): { examBoard: string | null } {
  if (!raw) return { examBoard: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      examBoard: normalizeExamBoard(typeof parsed.examBoard === "string" ? parsed.examBoard : null),
    };
  } catch {
    return { examBoard: null };
  }
}

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const searchParams = new URL(request.url).searchParams;
  const keyStageFilter = searchParams.get("keyStage")?.trim() ?? "";
  const yearGroupFilter = searchParams.get("yearGroup")?.trim() ?? "";
  const examBoardFilter = normalizeExamBoard(searchParams.get("examBoard")?.trim() ?? null) ?? "";
  const queryFilter = searchParams.get("query")?.trim().toLowerCase() ?? "";

  const assignments = await prisma.assignment.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      student: { select: { id: true, name: true, yearGroup: true, parent: { select: { email: true } } } },
      content: { select: { id: true, contentType: true, topic: true, skillFocus: true, level: true, metadataJson: true } },
    },
  });

  if (!assignments.length) {
    return NextResponse.json({ assignments: [] });
  }

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const studentIds = [...new Set(assignments.map((assignment) => assignment.studentId))];

  const [attemptTotals, correctAttemptTotals, weakWordAttempts] = await Promise.all([
    prisma.attempt.groupBy({
      by: ["assignmentId"],
      where: { assignmentId: { in: assignmentIds } },
      _count: { id: true },
    }),
    prisma.attempt.groupBy({
      by: ["assignmentId"],
      where: { assignmentId: { in: assignmentIds }, correct: true },
      _count: { id: true },
    }),
    prisma.attempt.findMany({
      where: { assignmentId: { in: assignmentIds }, correct: false },
      select: { assignmentId: true, questionText: true, correctAnswer: true },
    }),
  ]);

  const attemptMap = new Map<string, { attempts: number; correct: number }>();
  for (const row of attemptTotals) {
    const assignmentId = row.assignmentId;
    if (assignmentId == null) continue;
    attemptMap.set(assignmentId, {
      attempts: row._count.id,
      correct: 0,
    });
  }
  for (const row of correctAttemptTotals) {
    const assignmentId = row.assignmentId;
    if (assignmentId == null) continue;
    const current = attemptMap.get(assignmentId) ?? { attempts: 0, correct: 0 };
    current.correct = row._count.id;
    attemptMap.set(assignmentId, current);
  }

  const weakWordsFromAttemptsMap = new Map<string, string[]>();
  for (const attempt of weakWordAttempts) {
    if (!attempt.assignmentId) continue;
    const weakWord = attempt.correctAnswer || attempt.questionText || "";
    if (weakWord) {
      const existing = weakWordsFromAttemptsMap.get(attempt.assignmentId) ?? [];
      existing.push(weakWord);
      weakWordsFromAttemptsMap.set(attempt.assignmentId, existing);
    }
  }

  const weakAreas = await prisma.weakArea.findMany({
    where: {
      studentId: { in: studentIds },
      status: "active",
    },
    select: {
      studentId: true,
      subject: true,
      skillFocus: true,
      weaknessType: true,
      accuracy: true,
      currentDifficulty: true,
      metadataJson: true,
    },
  });

  const weakAreasByStudentSubject = new Map<string, typeof weakAreas>();
  for (const area of weakAreas) {
    const key = `${area.studentId}|${area.subject}`;
    const existing = weakAreasByStudentSubject.get(key) ?? [];
    existing.push(area);
    weakAreasByStudentSubject.set(key, existing);
  }

  const mappedAssignments = assignments.map((assignment) => {
      const stats = attemptMap.get(assignment.id);
      const attemptsCount = stats?.attempts ?? 0;
      const correctCount = stats?.correct ?? 0;
      const contentMeta = parseContentMetadata(assignment.content.metadataJson);
      const relatedBySubject = weakAreasByStudentSubject.get(`${assignment.studentId}|${assignment.content.contentType}`) ?? [];
      const relatedWeakAreas = assignment.content.skillFocus
        ? relatedBySubject.filter((area) => area.skillFocus === assignment.content.skillFocus)
        : relatedBySubject;
      const weakWordsFromAttempts = weakWordsFromAttemptsMap.get(assignment.id) ?? [];
      const weakWords = relatedWeakAreas.reduce<string[]>(
        (all, area) => mergeWeakAreas(all, parseWeakAreaMetadata(area.metadataJson).weakWords),
        weakWordsFromAttempts,
      );
      return {
        id: assignment.id,
        status: assignment.status,
        completedAt: assignment.completedAt?.toISOString() ?? null,
        createdAt: assignment.createdAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
        student: assignment.student,
        content: {
          id: assignment.content.id,
          contentType: assignment.content.contentType,
          topic: assignment.content.topic,
          skillFocus: assignment.content.skillFocus,
          level: assignment.content.level,
          examBoard: contentMeta.examBoard,
        },
        attempts: attemptsCount,
        score: attemptsCount ? Math.round((correctCount / attemptsCount) * 100) : null,
        weakAreas: relatedWeakAreas.map((area) => ({
          subject: area.subject,
          skillFocus: area.skillFocus,
          weaknessType: area.weaknessType,
          accuracy: area.accuracy,
          currentDifficulty: area.currentDifficulty,
          weakWords: parseWeakAreaMetadata(area.metadataJson).weakWords,
        })),
        weakWords,
      };
    });

  const filteredAssignments = mappedAssignments.filter((assignment) => {
    const yearGroup = assignment.student.yearGroup ?? "";
    const keyStage = keyStageForYearGroup(yearGroup);
    const matchesYearGroup = !yearGroupFilter || yearGroup === yearGroupFilter;
    const matchesKeyStage = !keyStageFilter || keyStage === keyStageFilter;
    const matchesExamBoard = !examBoardFilter || assignment.content.examBoard === examBoardFilter;
    const haystack = `${assignment.student.name} ${assignment.student.parent.email} ${assignment.content.contentType} ${assignment.content.topic} ${assignment.content.skillFocus ?? ""}`.toLowerCase();
    const matchesQuery = !queryFilter || haystack.includes(queryFilter);
    return matchesYearGroup && matchesKeyStage && matchesExamBoard && matchesQuery;
  });

  return NextResponse.json({
    assignments: filteredAssignments,
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  try {
    const body = assignmentSchema.parse(await request.json());
    const explicitStudentIds = [...(body.studentIds ?? []), ...(body.studentId ? [body.studentId] : [])];
    const targetStudents = explicitStudentIds.length
      ? await prisma.childProfile.findMany({ where: { id: { in: explicitStudentIds }, archived: false }, select: { id: true } })
      : body.yearGroup
        ? await prisma.childProfile.findMany({ where: { yearGroup: body.yearGroup, archived: false }, select: { id: true } })
        : [];

    const [content] = await Promise.all([
      prisma.aIContentCache.findUnique({ where: { id: body.contentId }, select: { id: true } }),
    ]);
    if (!targetStudents.length || !content) {
      return NextResponse.json({ error: "Student or content not found." }, { status: 404 });
    }

    const assignments = [];
    const blocked: Array<{ studentId: string; reason: string; schoolId?: string; schoolName?: string; code?: string; details?: Record<string, unknown>; assignmentId?: string }> = [];
    for (const student of targetStudents) {
      try {
        const assignment = await assignContentToStudent({
          studentId: student.id,
          contentId: body.contentId,
          actorUserId: session.userId,
          reason: body.yearGroup ? `manual_year_group_assignment:${body.yearGroup}` : "manual_admin_assignment",
          forceResend: body.resend ?? false,
        });
        assignments.push(assignment);
      } catch (error) {
        if (error instanceof SchoolLicenceAccessError) {
          blocked.push({
            studentId: student.id,
            reason: error.reason,
            code: "SCHOOL_LICENCE_BLOCKED",
            schoolId: error.schoolId,
            schoolName: error.schoolName,
          });
          continue;
        }
        if (error instanceof AssignmentSafetyError) {
          blocked.push({
            studentId: student.id,
            reason: error.message,
            code: "SAFETY_BLOCKED",
            details: error.details,
          });
          continue;
        }
        if (error instanceof DuplicateAssignmentError) {
          blocked.push({
            studentId: student.id,
            reason: error.message,
            code: "DUPLICATE_ASSIGNMENT",
            assignmentId: error.assignmentId,
          });
          continue;
        }
        throw error;
      }
    }

    if (!assignments.length && blocked.length) {
      const allDuplicates = blocked.every((b) => b.code === "DUPLICATE_ASSIGNMENT");
      if (allDuplicates) {
        // All students already have this content assigned — return 200 so the UI can offer a resend
        return NextResponse.json({ assignments: [], blocked, count: 0, allDuplicates: true }, { status: 200 });
      }
      return NextResponse.json({ error: "All assignments were blocked.", blocked }, { status: 409 });
    }

    return NextResponse.json({ assignments, blocked, count: assignments.length }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid assignment payload." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  try {
    const body = assignmentStatusSchema.parse(await request.json());
    const assignment = await prisma.assignment.update({
      where: { id: body.assignmentId },
      data: body.status === "completed"
        ? { status: body.status, completedAt: new Date() }
        : { status: body.status },
      include: {
        student: { select: { id: true, name: true } },
        content: { select: { id: true, contentType: true, topic: true, skillFocus: true } },
      },
    });

    await invalidateAcademicIntelligenceSnapshot({
      studentId: assignment.student.id,
      reason: "admin_assignment_update",
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, assignment });
  } catch {
    return NextResponse.json({ error: "Invalid assignment status payload." }, { status: 400 });
  }
}
