import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { mergeStudentCurriculumProfileJson, readStudentCurriculumProfile } from "@/lib/student-curriculum-profile";

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

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

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

  const [correctCounts, totalCounts, recentActivity] = await Promise.all([
    prisma.progressRecord.groupBy({
      by: ["childId"],
      where: { childId: { in: childIds }, correct: true },
      _count: { id: true },
    }),
    prisma.progressRecord.groupBy({
      by: ["childId"],
      where: { childId: { in: childIds } },
      _count: { id: true },
    }),
    prisma.progressRecord.groupBy({
      by: ["childId"],
      where: { childId: { in: childIds }, createdAt: { gte: todayStart } },
      _count: { id: true },
    }),
  ]);

  const correctMap = Object.fromEntries(correctCounts.map((r) => [r.childId, r._count.id]));
  const totalMap = Object.fromEntries(totalCounts.map((r) => [r.childId, r._count.id]));
  const activeToday = new Set(recentActivity.map((r) => r.childId));

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
    const total = totalMap[child.id] ?? 0;
    const correct = correctMap[child.id] ?? 0;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : null;

    let weakPatterns: string[] = [];
    let spellingLevel = child.level;
    let mathLevel = child.level;

    if (child.snapshotJson) {
      try {
        const snap = JSON.parse(child.snapshotJson);
        const patterns = snap.spellingPatterns as Record<string, number> | undefined;
        if (patterns) {
          weakPatterns = Object.entries(patterns)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k]) => k);
        }
        if (snap.adaptive) {
          spellingLevel = snap.adaptive.spellingDifficulty ?? child.level;
          mathLevel = snap.adaptive.mathDifficulty ?? child.level;
        }
      } catch {
        // skip
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
      spellingLevel,
      mathLevel,
      stars: child.stars,
      xp: child.xp,
      streak: child.streak,
      accuracy,
      weakPatterns,
      totalSessions: child._count.progressRecords,
      activeToday: activeToday.has(child.id),
      lastActive: child.updatedAt.toISOString(),
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
