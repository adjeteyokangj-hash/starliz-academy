import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export function yearDifficultyRange(yearGroup?: string | null) {
  const year = Number(String(yearGroup ?? "").match(/\d/)?.[0] ?? 2);
  if (year <= 2) return { min: 1, max: 3, keyStage: "KS1" };
  return { min: 2, max: 5, keyStage: "KS2" };
}

export function nextDifficulty(current: number, accuracy: number, status: string, yearGroup?: string | null) {
  const range = yearDifficultyRange(yearGroup);
  let next = current;
  if (status === "active") next = Math.min(current, Math.max(range.min, current - 1));
  if (accuracy >= 80) next = current + 1;
  if (accuracy < 50) next = current - 1;
  return Math.max(range.min, Math.min(range.max, next));
}

export async function logDifficultyChange(input: {
  actorUserId?: string;
  studentId: string;
  subject: string;
  skillFocus: string;
  previousDifficulty: number;
  nextDifficulty: number;
  reason: string;
}) {
  if (input.previousDifficulty === input.nextDifficulty) return;
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "adaptive_difficulty.changed",
    entityType: "student",
    entityId: input.studentId,
    metadata: input,
  });
}

export async function currentDifficultyFor(studentId: string, subject: string, skillFocus: string, fallback: number, yearGroup?: string | null) {
  const weakArea = await prisma.weakArea.findUnique({
    where: { studentId_subject_skillFocus: { studentId, subject, skillFocus } },
    select: { currentDifficulty: true, status: true },
  });
  if (!weakArea) return Math.max(yearDifficultyRange(yearGroup).min, Math.min(yearDifficultyRange(yearGroup).max, fallback));
  return weakArea.status === "active" ? Math.max(yearDifficultyRange(yearGroup).min, weakArea.currentDifficulty - 1) : weakArea.currentDifficulty;
}
