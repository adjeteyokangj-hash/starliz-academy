import { prisma } from "@/lib/db";
import { SKILL_MAP } from "@/lib/skills";

export type SkillStatus = "weak" | "improving" | "mastered";

function computeStatus(accuracy: number): SkillStatus {
  if (accuracy >= 80) return "mastered";
  if (accuracy >= 60) return "improving";
  return "weak";
}

/**
 * Update StudentSkill rows for every skill tagged on an attempt.
 * Creates the row if it doesn't exist yet.
 */
export async function updateStudentSkills({
  studentId,
  skills,
  isCorrect,
}: {
  studentId: string;
  skills: string[];
  isCorrect: boolean;
}): Promise<void> {
  if (!skills.length) return;

  for (const skill of skills) {
    const existing = await prisma.studentSkill.findUnique({
      where: { studentId_skill: { studentId, skill } },
    });

    if (!existing) {
      await prisma.studentSkill.create({
        data: {
          studentId,
          skill,
          attempts: 1,
          correct: isCorrect ? 1 : 0,
          accuracy: isCorrect ? 100 : 0,
          status: isCorrect ? "improving" : "weak",
        },
      });
      continue;
    }

    const attempts = existing.attempts + 1;
    const correct = existing.correct + (isCorrect ? 1 : 0);
    const accuracy = (correct / attempts) * 100;
    const status = computeStatus(accuracy);

    await prisma.studentSkill.update({
      where: { studentId_skill: { studentId, skill } },
      data: { attempts, correct, accuracy, status },
    });
  }
}

export type StudentSkillRow = {
  skill: string;
  label: string;
  accuracy: number;
  attempts: number;
  status: SkillStatus;
};

/**
 * Returns all skill rows for a student, enriched with labels.
 */
export async function getStudentSkillProfile(studentId: string): Promise<StudentSkillRow[]> {
  const rows = await prisma.studentSkill.findMany({
    where: { studentId },
    orderBy: { accuracy: "asc" },
  });

  return rows.map((row) => ({
    skill: row.skill,
    label: SKILL_MAP[row.skill]?.label ?? row.skill,
    accuracy: Math.round(row.accuracy),
    attempts: row.attempts,
    status: row.status as SkillStatus,
  }));
}

type PrioritisedSkill = { skill: string; accuracy: number; status: SkillStatus };

/**
 * Returns the highest-priority skill to focus on for this student:
 * 1. Weakest "weak" skill (lowest accuracy)
 * 2. Weakest "improving" skill
 * 3. Foundation fallback
 */
export async function getPrioritySkill(
  studentId: string,
  subject?: "spelling" | "maths" | "reading",
): Promise<string> {
  const rows = await prisma.studentSkill.findMany({
    where: { studentId },
    orderBy: { accuracy: "asc" },
  });

  // Filter by subject if provided
  const relevant: PrioritisedSkill[] = subject
    ? rows.filter((r) => {
        const def = SKILL_MAP[r.skill];
        return def?.subject === subject || def?.subject === "foundation";
      }).map((r) => ({ skill: r.skill, accuracy: r.accuracy, status: r.status as SkillStatus }))
    : rows.map((r) => ({ skill: r.skill, accuracy: r.accuracy, status: r.status as SkillStatus }));

  const weak = relevant.find((r) => r.status === "weak");
  if (weak) {
    // Check prerequisite — if prerequisite is also weak, fix that first
    const prereq = SKILL_MAP[weak.skill]?.prerequisite;
    if (prereq) {
      const prereqRow = relevant.find((r) => r.skill === prereq);
      if (!prereqRow || prereqRow.accuracy < 60) return prereq;
    }
    return weak.skill;
  }

  const improving = relevant.find((r) => r.status === "improving");
  if (improving) return improving.skill;

  // Default foundation per subject
  if (subject === "spelling") return "cvc";
  if (subject === "maths") return "number_bonds_10";
  if (subject === "reading") return "retrieval";
  return "letter_sound";
}

/**
 * Foundation check: if student is struggling with spelling/reading,
 * verify their letter_sound baseline is solid first.
 */
export async function shouldRedirectToFoundation(studentId: string): Promise<boolean> {
  const letterSound = await prisma.studentSkill.findUnique({
    where: { studentId_skill: { studentId, skill: "letter_sound" } },
  });
  // If they've never been tested on letter_sound or accuracy < 60, redirect
  if (!letterSound || letterSound.accuracy < 60) return true;
  return false;
}
