import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { fromDbRecord } from "@/lib/child_profile_db";
import { parseWalletMetadata, summarizeWalletTransactions } from "@/lib/wallet_ledger";
import { parseWeakAreaMetadata } from "@/lib/weakAreas";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { mergeStudentCurriculumProfileJson, readStudentCurriculumProfile } from "@/lib/student-curriculum-profile";
import { extractLearningDnaFromProfileJson, buildParentLearningDnaSummary } from "@/lib/learning_dna";

const updateStudentSchema = z.object({
  name: z.string().trim().min(1).optional(),
  parentId: z.string().min(1).optional(),
  age: z.number().int().min(1).max(18).nullable().optional(),
  yearGroup: z.string().trim().nullable().optional(),
  avatar: z.string().trim().nullable().optional(),
  level: z.number().int().min(1).max(10).optional(),
  selectedVoice: z.string().trim().nullable().optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  keyStageLevel: z.string().trim().nullable().optional(),
  learningLevel: z.string().trim().nullable().optional(),
  senSupportNeeds: z.string().trim().nullable().optional(),
  readingLevel: z.string().trim().nullable().optional(),
  weakAreasText: z.string().trim().nullable().optional(),
  voiceProfile: z.string().trim().nullable().optional(),
  aiLearningProfileJson: z.string().nullable().optional(),
  guardianPermissions: z.string().trim().nullable().optional(),
  schoolInformation: z.string().trim().nullable().optional(),
  subjectFocus: z.string().trim().nullable().optional(),
  curriculumPathway: z.string().trim().nullable().optional(),
  examBoard: z.string().trim().nullable().optional(),
  gcseSubjects: z.array(z.string().trim().min(1)).nullable().optional(),
  targetGrades: z.record(z.string(), z.string()).nullable().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;
  const student = await prisma.childProfile.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, email: true } },
      studentProfile: true,
      progressRecords: { orderBy: { createdAt: "desc" }, take: 20 },
      attempts: { orderBy: { createdAt: "desc" }, take: 50 },
      weakAreas: { orderBy: { lastDetectedAt: "desc" }, take: 20 },
      rewards: { include: { reward: true }, orderBy: { purchasedAt: "desc" }, take: 100 },
      walletTransactions: { orderBy: { createdAt: "desc" }, take: 250 },
      _count: { select: { progressRecords: true, rewards: true } },
    },
  });

  if (!student || student.archived) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const total = student.attempts.length || student.progressRecords.length;
  const correct = student.attempts.length ? student.attempts.filter((record) => record.correct === true).length : student.progressRecords.filter((record) => record.correct === true).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : null;
  const normalizedStudent = fromDbRecord(student);
  const curriculumProfile = readStudentCurriculumProfile({
    yearGroup: student.yearGroup,
    keyStageLevel: student.studentProfile?.keyStageLevel ?? null,
    aiLearningProfileJson: student.studentProfile?.aiLearningProfileJson ?? null,
  });
  const learningDna = extractLearningDnaFromProfileJson(student.studentProfile?.aiLearningProfileJson ?? null);
  const adaptiveTutor = learningDna
    ? buildParentLearningDnaSummary(learningDna)
    : {
        enoughHistory: false,
        readinessLabel: "Not enough learning history yet",
        fallbackMessage: "Not enough learning history yet. The tutor will adapt as more activities are completed.",
      };
  const walletSummary = summarizeWalletTransactions(student.walletTransactions, student.coins);

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.name,
      avatar: student.avatar,
      age: student.age,
      yearGroup: student.yearGroup,
      level: student.level,
      selectedVoice: student.selectedVoice,
      studentProfile: student.studentProfile
        ? {
            ...student.studentProfile,
            dateOfBirth: student.studentProfile.dateOfBirth?.toISOString() ?? null,
            curriculumPathway: curriculumProfile.curriculumPathway,
            examBoard: curriculumProfile.examBoard,
            gcseSubjects: curriculumProfile.gcseSubjects,
            targetGrades: curriculumProfile.targetGrades,
            createdAt: student.studentProfile.createdAt.toISOString(),
            updatedAt: student.studentProfile.updatedAt.toISOString(),
          }
        : null,
      stars: student.stars,
      xp: student.xp,
      coins: student.coins,
      streak: student.streak,
      accuracy,
      parent: student.parent,
      totalSessions: total,
      rewardsCount: student._count.rewards,
      createdAt: student.createdAt.toISOString(),
      updatedAt: student.updatedAt.toISOString(),
      recentLevelDecisions: [...(normalizedStudent.levelDecisions ?? [])].slice(-12).reverse(),
      recommendedNextActivity: normalizedStudent.adaptive.nextBestActivity,
      adaptiveTutor,
      walletSummary,
      ownedItems: student.rewards.map((reward) => ({
        id: reward.rewardId,
        name: reward.reward.name,
        category: reward.reward.category,
        equipped: reward.isEquipped,
        purchasedAt: reward.purchasedAt.toISOString(),
      })),
      walletTransactions: student.walletTransactions.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: entry.amount,
        source: entry.source,
        itemId: entry.itemId,
        reason: entry.reason,
        balanceBefore: entry.balanceBefore,
        balanceAfter: entry.balanceAfter,
        createdAt: entry.createdAt.toISOString(),
        metadata: parseWalletMetadata(entry.metadataJson),
      })),
      progressRecords: student.progressRecords.map((record) => ({
        id: record.id,
        activityType: record.activityType,
        activityName: record.activityName,
        correct: record.correct,
        accuracy: record.accuracy,
        completed: record.completed,
        createdAt: record.createdAt.toISOString(),
      })),
      attempts: student.attempts.map((attempt) => ({
        id: attempt.id,
        subject: attempt.subject,
        spellingMode: attempt.spellingMode,
        skillFocus: attempt.skillFocus,
        correct: attempt.correct,
        responseTimeMs: attempt.responseTimeMs,
        hintsUsed: attempt.hintsUsed,
        difficulty: attempt.difficulty,
        createdAt: attempt.createdAt.toISOString(),
      })),
      modeStruggles: Object.entries(student.attempts.reduce<Record<string, { total: number; correct: number }>>((acc, attempt) => {
        if (attempt.subject !== "spelling" || !attempt.spellingMode) return acc;
        const bucket = acc[attempt.spellingMode] ?? { total: 0, correct: 0 };
        bucket.total += 1;
        if (attempt.correct) bucket.correct += 1;
        acc[attempt.spellingMode] = bucket;
        return acc;
      }, {}))
        .map(([mode, stats]) => ({ mode, accuracy: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0, total: stats.total }))
        .filter((item) => item.total >= 2)
        .sort((left, right) => left.accuracy - right.accuracy || right.total - left.total)
        .slice(0, 5),
      weakAreas: student.weakAreas.map((area) => {
        const metadata = parseWeakAreaMetadata(area.metadataJson);
        return {
          id: area.id,
          subject: area.subject,
          keyStage: area.keyStage,
          yearGroup: area.yearGroup,
          skillFocus: area.skillFocus,
          weaknessType: area.weaknessType,
          accuracy: area.accuracy,
          attemptsCount: area.attemptsCount,
          currentDifficulty: area.currentDifficulty,
          status: area.status,
          lastDetectedAt: area.lastDetectedAt.toISOString(),
          interventionLaunchedAt: metadata.intervention?.launchedAt ?? null,
          interventionCompletedAt: metadata.intervention?.completedAt ?? null,
          interventionImprovementPct: metadata.intervention?.improvementPct ?? null,
        };
      }),
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  try {
    const body = updateStudentSchema.parse(await request.json());
    const existing = await prisma.childProfile.findUnique({
      where: { id },
      select: {
        yearGroup: true,
        studentProfile: { select: { aiLearningProfileJson: true, keyStageLevel: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const nextYearGroup = body.yearGroup !== undefined ? body.yearGroup : existing.yearGroup;
    const nextKeyStage = body.keyStageLevel !== undefined
      ? body.keyStageLevel
      : (existing.studentProfile?.keyStageLevel ?? (nextYearGroup ? keyStageForYearGroup(nextYearGroup) : null));
    const shouldUpdateCurriculumProfile = body.curriculumPathway !== undefined
      || body.examBoard !== undefined
      || body.gcseSubjects !== undefined
      || body.targetGrades !== undefined
      || body.yearGroup !== undefined
      || body.keyStageLevel !== undefined
      || body.aiLearningProfileJson !== undefined;
    const nextAiProfileJson = shouldUpdateCurriculumProfile
      ? mergeStudentCurriculumProfileJson({
          existingJson: body.aiLearningProfileJson !== undefined
            ? body.aiLearningProfileJson
            : (existing.studentProfile?.aiLearningProfileJson ?? null),
          yearGroup: nextYearGroup,
          keyStage: nextKeyStage,
          curriculumPathway: body.curriculumPathway,
          examBoard: body.examBoard,
          gcseSubjects: body.gcseSubjects ?? null,
          targetGrades: body.targetGrades ?? null,
        })
      : undefined;

    const profileData = {
      ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null } : {}),
      ...(body.keyStageLevel !== undefined ? { keyStageLevel: body.keyStageLevel } : {}),
      ...(body.learningLevel !== undefined ? { learningLevel: body.learningLevel } : {}),
      ...(body.senSupportNeeds !== undefined ? { senSupportNeeds: body.senSupportNeeds } : {}),
      ...(body.readingLevel !== undefined ? { readingLevel: body.readingLevel } : {}),
      ...(body.weakAreasText !== undefined ? { weakAreasText: body.weakAreasText } : {}),
      ...(body.voiceProfile !== undefined ? { voiceProfile: body.voiceProfile } : {}),
      ...(nextAiProfileJson !== undefined ? { aiLearningProfileJson: nextAiProfileJson } : {}),
      ...(body.guardianPermissions !== undefined ? { guardianPermissions: body.guardianPermissions } : {}),
      ...(body.schoolInformation !== undefined ? { schoolInformation: body.schoolInformation } : {}),
      ...(body.subjectFocus !== undefined ? { subjectFocus: body.subjectFocus } : {}),
    };
    if (body.parentId) {
      const parent = await prisma.user.findFirst({
        where: { id: body.parentId, role: "parent" },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "A student must belong to a valid parent account." }, { status: 400 });
      }
    }

    const student = await prisma.childProfile.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.parentId
          ? {
              parent: {
                connect: { id: body.parentId },
              },
            }
          : {}),
        ...(body.age !== undefined ? { age: body.age } : {}),
        ...(body.yearGroup !== undefined ? { yearGroup: body.yearGroup } : {}),
        ...(body.avatar !== undefined ? { avatar: body.avatar } : {}),
        ...(body.selectedVoice != null ? { selectedVoice: body.selectedVoice } : {}),
        ...(body.level !== undefined ? { level: body.level } : {}),
        ...(Object.keys(profileData).length
          ? {
              studentProfile: {
                upsert: {
                  create: profileData,
                  update: profileData,
                },
              },
            }
          : {}),
      },
      select: { id: true, name: true, parentId: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "updated",
      entityType: "student",
      entityId: student.id,
      metadata: body,
    });

    return NextResponse.json({ student });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const fieldNameRaw = issue.path[0] ?? "field";
      const fieldName = typeof fieldNameRaw === "string" ? fieldNameRaw : String(fieldNameRaw);
      return NextResponse.json({ error: `${fieldName}: ${issue.message}` }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid student update." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;
  const student = await prisma.childProfile.findUnique({
    where: { id },
    select: { id: true, archived: true, name: true },
  });

  if (!student || student.archived) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  await prisma.childProfile.update({
    where: { id },
    data: { archived: true },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "archived",
    entityType: "student",
    entityId: id,
    metadata: { name: student.name },
  });

  return NextResponse.json({ ok: true });
}
