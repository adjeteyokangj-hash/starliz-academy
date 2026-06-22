import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { mergeStudentCurriculumProfileJson, readStudentCurriculumProfile } from "@/lib/student-curriculum-profile";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { deriveAdminStudentSnapshotLevels } from "@/lib/admin-student-levels";
import { buildLearningActivitySummaries } from "@/lib/learning-activity-aggregation";

const createStudentSchema = z.object({
  parentId: z.string().min(1),
  name: z.string().trim().min(1),
  age: z.number().int().min(1).max(18).optional(),
  yearGroup: z.string().trim().optional(),
  selectedVoice: z.string().trim().optional(),
  level: z.number().int().min(1).max(10).optional(),
  dateOfBirth: z.string().datetime().optional(),
  avatar: z.string().trim().optional(),
  keyStageLevel: z.string().trim().optional(),
  learningLevel: z.string().trim().optional(),
  senSupportNeeds: z.string().trim().optional(),
  readingLevel: z.string().trim().optional(),
  weakAreasText: z.string().trim().optional(),
  voiceProfile: z.string().trim().optional(),
  aiLearningProfileJson: z.string().optional(),
  guardianPermissions: z.string().trim().optional(),
  schoolInformation: z.string().trim().optional(),
  subjectFocus: z.string().trim().optional(),
  curriculumPathway: z.string().trim().optional(),
  examBoard: z.string().trim().optional(),
  gcseSubjects: z.array(z.string().trim().min(1)).optional(),
  targetGrades: z.record(z.string(), z.string()).optional(),
});

type StudentContentAssignmentStatus = "none" | "assigned" | "in_progress" | "completed" | "archived";

type StudentContentAssignmentHistoryEntry = {
  assignedAt: string;
  statusAtTime: StudentContentAssignmentStatus;
};

type StudentContentAssignmentInsight = {
  assignmentCount: number;
  lastAssignedAt: string | null;
  currentStatus: StudentContentAssignmentStatus;
  hasActiveAssignment: boolean;
  progressAnswered: number;
  totalQuestions: number;
  completedAt: string | null;
  history: StudentContentAssignmentHistoryEntry[];
  badges: string[];
};

function toQuestionCount(contentJson: string | null): number {
  if (!contentJson) return 0;
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") return 1;
    return 0;
  } catch {
    return 0;
  }
}

export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const context = new URL(request.url).searchParams.get("context")?.trim();

  if (context === "assignment") {
    const contentId = new URL(request.url).searchParams.get("contentId")?.trim() ?? "";
    const children = await prisma.childProfile.findMany({
      where: { archived: false },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        age: true,
        yearGroup: true,
        snapshotJson: true,
        parent: { select: { email: true, name: true } },
        studentProfile: {
          select: {
            keyStageLevel: true,
            subjectFocus: true,
            aiLearningProfileJson: true,
            learningLevel: true,
          },
        },
        schoolLinks: {
          where: { status: "active" },
          select: {
            school: { select: { id: true } },
            classroom: { select: { name: true } },
          },
        },
      },
    });

    const studentIds = children.map((child) => child.id);
    const studentIdSet = new Set(studentIds);
    const contentAssignmentInsightByStudent = new Map<string, StudentContentAssignmentInsight>();

    if (contentId && studentIds.length > 0) {
      const [contentRecord, assignments, assignmentCreatedLogs] = await Promise.all([
        prisma.aIContentCache.findUnique({
          where: { id: contentId },
          select: { id: true, contentJson: true },
        }),
        prisma.assignment.findMany({
          where: { contentId, studentId: { in: studentIds } },
          select: {
            id: true,
            studentId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            completedAt: true,
          },
        }),
        prisma.auditLog.findMany({
          where: {
            action: "assignment.created",
            metadataJson: { contains: `\"contentId\":\"${contentId}\"` },
          },
          orderBy: { createdAt: "desc" },
          take: 5000,
          select: { createdAt: true, metadataJson: true },
        }),
      ]);

      const assignmentIds = assignments.map((assignment) => assignment.id);
      const assignmentAttempts = assignmentIds.length
        ? await prisma.attempt.groupBy({
            by: ["assignmentId"],
            where: { assignmentId: { in: assignmentIds } },
            _count: { id: true },
          })
        : [];

      const totalQuestions = toQuestionCount(contentRecord?.contentJson ?? null);
      const assignmentByStudent = new Map(assignments.map((assignment) => [assignment.studentId, assignment]));
      const progressByAssignment = new Map(assignmentAttempts.map((row) => [row.assignmentId, row._count.id]));
      const historyByStudent = new Map<string, StudentContentAssignmentHistoryEntry[]>();

      for (const row of assignmentCreatedLogs) {
        if (!row.metadataJson) continue;
        try {
          const metadata = JSON.parse(row.metadataJson) as { studentId?: string; contentId?: string };
          if (!metadata.studentId || !studentIdSet.has(metadata.studentId) || metadata.contentId !== contentId) continue;
          const history = historyByStudent.get(metadata.studentId) ?? [];
          const currentAssignment = assignmentByStudent.get(metadata.studentId);
          history.push({
            assignedAt: row.createdAt.toISOString(),
            statusAtTime: (currentAssignment?.status as StudentContentAssignmentStatus | undefined) ?? "assigned",
          });
          historyByStudent.set(metadata.studentId, history);
        } catch {
          continue;
        }
      }

      for (const studentId of studentIds) {
        const assignment = assignmentByStudent.get(studentId);
        const history = (historyByStudent.get(studentId) ?? []).sort((a, b) => Date.parse(b.assignedAt) - Date.parse(a.assignedAt));
        const currentStatus = (assignment?.status as StudentContentAssignmentStatus | undefined) ?? "none";
        const hasActiveAssignment = currentStatus === "assigned" || currentStatus === "in_progress";
        const assignmentCount = history.length;
        const lastAssignedAt = history[0]?.assignedAt ?? assignment?.updatedAt.toISOString() ?? null;
        const progressAnswered = assignment ? (progressByAssignment.get(assignment.id) ?? 0) : 0;
        const badges: string[] = [];

        if (assignmentCount === 0) {
          badges.push("Never Assigned");
        } else {
          badges.push(`Assigned Before (${assignmentCount})`);
        }
        if (hasActiveAssignment) badges.push("Currently Active");
        if (currentStatus === "completed") badges.push("Completed");
        if (currentStatus === "archived") badges.push("Expired");

        contentAssignmentInsightByStudent.set(studentId, {
          assignmentCount,
          lastAssignedAt,
          currentStatus,
          hasActiveAssignment,
          progressAnswered,
          totalQuestions,
          completedAt: assignment?.completedAt?.toISOString() ?? null,
          history: history.slice(0, 10),
          badges,
        });
      }
    }

    const students = children.map((child) => {
      let weakPatterns: string[] = [];
      if (child.snapshotJson) {
        try {
          const snap = JSON.parse(child.snapshotJson) as { spellingPatterns?: Record<string, number> };
          const patterns = snap.spellingPatterns;
          if (patterns) {
            weakPatterns = Object.entries(patterns)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([key]) => key);
          }
        } catch {
          weakPatterns = [];
        }
      }

      const normalizedKeyStage = child.studentProfile?.keyStageLevel ?? (child.yearGroup ? keyStageForYearGroup(child.yearGroup) : null);
      const curriculumProfile = readStudentCurriculumProfile({
        yearGroup: child.yearGroup,
        keyStageLevel: normalizedKeyStage,
        aiLearningProfileJson: child.studentProfile?.aiLearningProfileJson ?? null,
      });
      const classGroups = child.schoolLinks
        .map((link) => link.classroom?.name)
        .filter((name): name is string => Boolean(name));
      const quickLevelFinder = parseQuickLevelFinderSession(child.studentProfile?.aiLearningProfileJson ?? null);

      return {
        id: child.id,
        name: child.name,
        age: child.age,
        yearGroup: child.yearGroup,
        keyStageLevel: normalizedKeyStage,
        curriculumPathway: curriculumProfile.curriculumPathway,
        learningLevel: child.studentProfile?.learningLevel ?? null,
        placementLevels: quickLevelFinder?.levels ?? {},
        examBoard: curriculumProfile.examBoard,
        classGroup: classGroups[0] ?? null,
        classGroups,
        schoolIds: child.schoolLinks.map((link) => link.school.id),
        parentEmail: child.parent.email,
        parentName: child.parent.name,
        subjectFocus: child.studentProfile?.subjectFocus ?? null,
        weakPatterns,
        contentAssignment: contentAssignmentInsightByStudent.get(child.id),
      };
    });

    return NextResponse.json({ students });
  }

  const children = await prisma.childProfile.findMany({
    where: { archived: false },
    orderBy: { updatedAt: "desc" },
    include: {
      parent: { select: { email: true, name: true } },
      studentProfile: true,
      schoolLinks: {
        where: { status: "active" },
        include: {
          school: { select: { id: true } },
          classroom: { select: { name: true } },
        },
      },
      _count: { select: { progressRecords: true } },
    },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const childIds = children.map((c) => c.id);

  const [activityAttempts, activityProgress, activityAssignments, activityWeakAreas, activitySkills] = await Promise.all([
    prisma.attempt.findMany({
      where: { studentId: { in: childIds } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { id: true, studentId: true, subject: true, skillFocus: true, correct: true, createdAt: true },
    }),
    prisma.progressRecord.findMany({
      where: { childId: { in: childIds } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { id: true, childId: true, activityType: true, activityName: true, correct: true, completed: true, score: true, accuracy: true, createdAt: true },
    }),
    prisma.assignment.findMany({
      where: { studentId: { in: childIds } },
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: { id: true, studentId: true, status: true, updatedAt: true, completedAt: true },
    }),
    prisma.weakArea.findMany({
      where: { studentId: { in: childIds } },
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: { studentId: true, skillFocus: true, status: true, accuracy: true, attemptsCount: true, lastDetectedAt: true },
    }),
    prisma.studentSkill.findMany({
      where: { studentId: { in: childIds } },
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: { studentId: true, skill: true, status: true, accuracy: true, attempts: true, updatedAt: true },
    }),
  ]);

  const activitySummaries = buildLearningActivitySummaries({
    studentIds: childIds,
    attempts: activityAttempts,
    progressRecords: activityProgress,
    assignments: activityAssignments,
    weakAreas: activityWeakAreas,
    studentSkills: activitySkills,
    profiles: children.map((child) => ({
      studentId: child.id,
      aiLearningProfileJson: child.studentProfile?.aiLearningProfileJson ?? null,
    })),
    today: todayStart,
  });

  // Frustration signal counts from the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentNotes = await prisma.progressRecord.findMany({
    where: { childId: { in: childIds }, createdAt: { gte: sevenDaysAgo }, notes: { not: null } },
    select: { childId: true, notes: true },
  });
  const frustrationMap: Record<string, number> = {};
  for (const rec of recentNotes) {
    if (!rec.notes) continue;
    try {
      const n = JSON.parse(rec.notes) as { frustrationSignals?: string };
      if (n.frustrationSignals === "High") {
        frustrationMap[rec.childId] = (frustrationMap[rec.childId] ?? 0) + 1;
      }
    } catch {
      // ignore malformed notes
    }
  }

  // Frustration threshold from AI adaptation settings
  type AIAdaptRow = { frustrationThreshold: number } | null;
  const adaptModel = (prisma as unknown as { aIAdaptationSettings?: { findFirst: () => Promise<AIAdaptRow> } }).aIAdaptationSettings;
  const adaptSettings = adaptModel ? await adaptModel.findFirst() : null;
  const frustrationThreshold = adaptSettings?.frustrationThreshold ?? 3;

  const result = children.map((child) => {
    const activity = activitySummaries.get(child.id);
    const accuracy = activity?.accuracy ?? null;

    const snapshotLevels = deriveAdminStudentSnapshotLevels(child.snapshotJson, child.level);

    const normalizedKeyStage = child.studentProfile?.keyStageLevel ?? (child.yearGroup ? keyStageForYearGroup(child.yearGroup) : null);
    const curriculumProfile = readStudentCurriculumProfile({
      yearGroup: child.yearGroup,
      keyStageLevel: normalizedKeyStage,
      aiLearningProfileJson: child.studentProfile?.aiLearningProfileJson ?? null,
    });
    const classGroups = child.schoolLinks
      .map((link) => link.classroom?.name)
      .filter((name): name is string => Boolean(name));
    const schoolIds = child.schoolLinks.map((link) => link.school.id);

    return {
      id: child.id,
      name: child.name,
      avatar: child.avatar,
      age: child.age,
      yearGroup: child.yearGroup,
      level: child.level,
      keyStageLevel: normalizedKeyStage,
      curriculumPathway: curriculumProfile.curriculumPathway,
      examBoard: curriculumProfile.examBoard,
      gcseSubjects: curriculumProfile.gcseSubjects,
      targetGrades: curriculumProfile.targetGrades,
      learningLevel: child.studentProfile?.learningLevel ?? null,
      readingLevel: child.studentProfile?.readingLevel ?? null,
      subjectFocus: child.studentProfile?.subjectFocus ?? null,
      classGroup: classGroups[0] ?? null,
      classGroups,
      schoolIds,
      spellingLevel: snapshotLevels.spellingLevel,
      mathLevel: snapshotLevels.mathLevel,
      readingSubjectLevel: snapshotLevels.readingLevel,
      stars: child.stars,
      xp: child.xp,
      streak: child.streak,
      accuracy,
      weakPatterns: snapshotLevels.weakPatterns,
      totalSessions: activity?.totalEvents ?? child._count.progressRecords,
      activeToday: activity?.activeToday ?? false,
      lastActive: activity?.lastActivityAt ?? child.updatedAt.toISOString(),
      parentEmail: child.parent.email,
      parentName: child.parent.name,
      frustrationCount: frustrationMap[child.id] ?? 0,
    };
  });

  return NextResponse.json({ students: result, frustrationThreshold });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  try {
    let body;
    try {
      body = createStudentSchema.parse(await request.json());
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        const issue = parseError.issues[0];
        const fieldNameRaw = issue.path[0] ?? "body";
        const fieldName = typeof fieldNameRaw === "string" ? fieldNameRaw : String(fieldNameRaw);
        let message = `${fieldName}: ${issue.message}`;
        if (fieldName === "name" && issue.code === "too_small") {
          message = "Student name is required";
        } else if (fieldName === "parentId" && issue.code === "too_small") {
          message = "Please select a parent";
        }
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw parseError;
    }

    const parent = await prisma.user.findFirst({
      where: { id: body.parentId, role: "parent" },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json(
        { error: "A student must belong to a valid parent account." },
        { status: 400 }
      );
    }

    const student = await prisma.childProfile.create({
      data: {
        id: randomUUID(),
        parentId: parent.id,
        name: body.name,
        age: body.age,
        yearGroup: body.yearGroup,
        selectedVoice: body.selectedVoice || "friendly_coach",
        level: body.level || 1,
        avatar: body.avatar,
        studentProfile: {
          create: {
            dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
            keyStageLevel: body.keyStageLevel || null,
            learningLevel: body.learningLevel || null,
            senSupportNeeds: body.senSupportNeeds || null,
            readingLevel: body.readingLevel || null,
            weakAreasText: body.weakAreasText || null,
            voiceProfile: body.voiceProfile || body.selectedVoice || null,
            aiLearningProfileJson: mergeStudentCurriculumProfileJson({
              existingJson: body.aiLearningProfileJson || null,
              yearGroup: body.yearGroup ?? null,
              keyStage: body.keyStageLevel ?? (body.yearGroup ? keyStageForYearGroup(body.yearGroup) : null),
              curriculumPathway: body.curriculumPathway ?? null,
              examBoard: body.examBoard ?? null,
              gcseSubjects: body.gcseSubjects ?? null,
              targetGrades: body.targetGrades ?? null,
            }),
            guardianPermissions: body.guardianPermissions || null,
            schoolInformation: body.schoolInformation || null,
            subjectFocus: body.subjectFocus || null,
          },
        },
      },
      select: { id: true, name: true, parentId: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "created",
      entityType: "student",
      entityId: student.id,
      metadata: { parentId: parent.id, name: student.name },
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    console.error("Student creation error:", error);
    return NextResponse.json(
      { error: "Unable to create student account. Please try again." },
      { status: 500 }
    );
  }
}
