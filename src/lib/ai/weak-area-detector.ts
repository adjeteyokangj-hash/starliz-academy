import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { assignContentToStudent } from "@/lib/assignments";
import { logDifficultyChange, nextDifficulty, yearDifficultyRange } from "./adaptive-difficulty";
import { generateDraftContent } from "./generate-content";

function inferSkillFocus(record: { notes: string | null; activityName: string }) {
  return (record.notes || record.activityName || "General practice").slice(0, 80);
}

function inferWeaknessType(accuracy: number, hintRate: number, responseTime: number, averageResponseTime: number) {
  if (accuracy < 60) return "weak";
  if (hintRate >= 0.5) return "needs support";
  if (averageResponseTime > 0 && responseTime > averageResponseTime * 1.35) return "slow recall";
  return "improving";
}

export async function detectAndStoreWeakAreas(actorUserId?: string) {
  const records = await prisma.progressRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { child: { select: { id: true, name: true, yearGroup: true } } },
  });

  const responseTimes = records
    .map((record) => {
      const match = String(record.notes ?? "").match(/responseTimeMs:(\d+)/i);
      return match ? Number(match[1]) : 0;
    })
    .filter(Boolean);
  const averageResponseTime = responseTimes.length ? responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length : 0;

  const groups = new Map<string, typeof records>();
  for (const record of records) {
    const skillFocus = inferSkillFocus(record);
    const key = `${record.childId}|${record.activityType}|${skillFocus}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const weakAreas = [];
  for (const [key, attempts] of groups.entries()) {
    if (attempts.length < 2) continue;
    const [studentId, subject, skillFocus] = key.split("|");
    const correct = attempts.filter((attempt) => attempt.correct === true).length;
    const accuracy = Math.round((correct / attempts.length) * 100);
    const hintUsage = attempts.filter((attempt) => /hint/i.test(attempt.notes ?? "")).length / attempts.length;
    const groupResponseTimes = attempts
      .map((attempt) => Number(String(attempt.notes ?? "").match(/responseTimeMs:(\d+)/i)?.[1] ?? 0))
      .filter(Boolean);
    const responseTime = groupResponseTimes.length ? groupResponseTimes.reduce((total, value) => total + value, 0) / groupResponseTimes.length : 0;
    const weaknessType = inferWeaknessType(accuracy, hintUsage, responseTime, averageResponseTime);
    const status = accuracy >= 80 ? "resolved" : accuracy >= 60 ? "improving" : "active";
    const student = attempts[0].child;
    const range = yearDifficultyRange(student.yearGroup);
    const previous = await prisma.weakArea.findUnique({ where: { studentId_subject_skillFocus: { studentId, subject, skillFocus } } });
    const previousDifficulty = previous?.currentDifficulty ?? Math.max(range.min, Math.min(range.max, attempts[0].difficulty ?? range.min));
    const currentDifficulty = nextDifficulty(previousDifficulty, accuracy, status, student.yearGroup);

    const weakArea = await prisma.weakArea.upsert({
      where: { studentId_subject_skillFocus: { studentId, subject, skillFocus } },
      create: {
        studentId,
        subject,
        keyStage: range.keyStage,
        yearGroup: student.yearGroup,
        skillFocus,
        weaknessType,
        accuracy,
        attemptsCount: attempts.length,
        currentDifficulty,
        status,
        metadataJson: JSON.stringify({ hintUsage, responseTime }),
      },
      update: {
        keyStage: range.keyStage,
        yearGroup: student.yearGroup,
        weaknessType,
        accuracy,
        attemptsCount: attempts.length,
        currentDifficulty,
        status,
        lastDetectedAt: new Date(),
        metadataJson: JSON.stringify({ hintUsage, responseTime }),
      },
      include: { student: { select: { name: true } } },
    });

    await logDifficultyChange({
      actorUserId,
      studentId,
      subject,
      skillFocus,
      previousDifficulty,
      nextDifficulty: currentDifficulty,
      reason: `accuracy ${accuracy}% status ${status}`,
    });

    if (accuracy < 60) {
      const contentType = subject === "math" || subject === "reading" ? subject : "spelling";
      const generated = await generateDraftContent({
        type: contentType,
        level: Math.max(range.min, currentDifficulty - 1),
        topic: `${weaknessType} support for ${skillFocus}`,
        createdBy: "weak-area-detector",
      });
      await assignContentToStudent({
        studentId,
        contentId: generated.record.id,
        actorUserId,
        reason: `auto_assigned_weak_area_${accuracy}`,
      });
    }
    weakAreas.push(weakArea);
  }

  await writeAuditLog({
    actorUserId,
    action: "weak_areas.detected",
    entityType: "weak_area",
    metadata: { count: weakAreas.length },
  });

  return weakAreas;
}

export async function recalculateWeakAreaFromAttempts(input: {
  studentId: string;
  subject: string;
  skillFocus: string;
  actorUserId?: string;
}) {
  const attempts = await prisma.attempt.findMany({
    where: {
      studentId: input.studentId,
      subject: input.subject,
      skillFocus: input.skillFocus,
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { student: { select: { name: true, yearGroup: true } } },
  });
  if (attempts.length < 2) return null;

  const correct = attempts.filter((attempt) => attempt.correct).length;
  const accuracy = Math.round((correct / attempts.length) * 100);
  const hintUsage = attempts.filter((attempt) => attempt.hintsUsed > 0).length / attempts.length;
  const avgResponse = attempts.reduce((total, attempt) => total + attempt.responseTimeMs, 0) / attempts.length;
  const allStudentAttempts = await prisma.attempt.findMany({
    where: { studentId: input.studentId },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { responseTimeMs: true },
  });
  const studentAvgResponse = allStudentAttempts.length
    ? allStudentAttempts.reduce((total, attempt) => total + attempt.responseTimeMs, 0) / allStudentAttempts.length
    : avgResponse;

  const weaknessType = inferWeaknessType(accuracy, hintUsage, avgResponse, studentAvgResponse);
  const recentTwoStrong = attempts.slice(0, 2).length === 2 && attempts.slice(0, 2).every((attempt) => attempt.correct);
  const status = accuracy >= 80 && recentTwoStrong ? "resolved" : accuracy >= 60 ? "improving" : "active";
  const student = attempts[0].student;
  const range = yearDifficultyRange(attempts[0].yearGroup ?? student.yearGroup);
  const previous = await prisma.weakArea.findUnique({
    where: { studentId_subject_skillFocus: { studentId: input.studentId, subject: input.subject, skillFocus: input.skillFocus } },
  });
  const previousDifficulty = previous?.currentDifficulty ?? Math.max(range.min, Math.min(range.max, attempts[0].difficulty));
  const currentDifficulty = nextDifficulty(previousDifficulty, accuracy, status, attempts[0].yearGroup ?? student.yearGroup);

  const weakArea = await prisma.weakArea.upsert({
    where: { studentId_subject_skillFocus: { studentId: input.studentId, subject: input.subject, skillFocus: input.skillFocus } },
    create: {
      studentId: input.studentId,
      subject: input.subject,
      keyStage: attempts[0].keyStage ?? range.keyStage,
      yearGroup: attempts[0].yearGroup ?? student.yearGroup,
      skillFocus: input.skillFocus,
      weaknessType,
      accuracy,
      attemptsCount: attempts.length,
      currentDifficulty,
      status,
      metadataJson: JSON.stringify({ hintUsage, avgResponse }),
    },
    update: {
      keyStage: attempts[0].keyStage ?? range.keyStage,
      yearGroup: attempts[0].yearGroup ?? student.yearGroup,
      weaknessType,
      accuracy,
      attemptsCount: attempts.length,
      currentDifficulty,
      status,
      lastDetectedAt: new Date(),
      metadataJson: JSON.stringify({ hintUsage, avgResponse }),
    },
  });

  await logDifficultyChange({
    actorUserId: input.actorUserId,
    studentId: input.studentId,
    subject: input.subject,
    skillFocus: input.skillFocus,
    previousDifficulty,
    nextDifficulty: currentDifficulty,
    reason: `attempt accuracy ${accuracy}% status ${status}`,
  });

  if (status === "active" && accuracy < 60) {
    const generated = await generateDraftContent({
      type: input.subject === "math" || input.subject === "reading" ? input.subject : "spelling",
      level: Math.max(range.min, currentDifficulty - 1),
      topic: `${weaknessType} support for ${input.skillFocus}`,
      createdBy: "attempt-recalculation",
    });
    await assignContentToStudent({
      studentId: input.studentId,
      contentId: generated.record.id,
      actorUserId: input.actorUserId,
      reason: `auto_assigned_attempt_accuracy_${accuracy}`,
    });
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "weak_area.recalculated",
    entityType: "weak_area",
    entityId: weakArea.id,
    metadata: { studentId: input.studentId, subject: input.subject, skillFocus: input.skillFocus, accuracy, status },
  });

  return weakArea;
}
