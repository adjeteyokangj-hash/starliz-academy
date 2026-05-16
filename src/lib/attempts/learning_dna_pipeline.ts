import { updateLearningDnaFromAttempt, type LearningDnaAttemptSignal } from "@/lib/learning_dna";

export type ResolvedAttemptAssignment = {
  id: string;
  studentId: string;
  status: string;
  contentId: string;
  content: {
    contentType: string;
    contentJson: string;
  };
};

type AttemptPipelineDb = {
  assignment: {
    findFirst: (args: {
      where: {
        id: string;
        student?: { parentId: string };
      };
      select: {
        id: true;
        studentId: true;
        status: true;
        contentId: true;
        content: { select: { contentType: true; contentJson: true } };
      };
    }) => Promise<ResolvedAttemptAssignment | null>;
  };
  studentProfile: {
    findUnique: (args: { where: { childId: string }; select: { id: true; aiLearningProfileJson: true } }) => Promise<{ id: string; aiLearningProfileJson: string | null } | null>;
    update: (args: { where: { id: string }; data: { aiLearningProfileJson: string } }) => Promise<unknown>;
    create: (args: { data: { childId: string; aiLearningProfileJson: string } }) => Promise<unknown>;
  };
};

export async function resolveAttemptStudentIdentity(
  prisma: AttemptPipelineDb,
  input: { assignmentId?: string; requestedStudentId: string; parentId: string },
): Promise<{ resolvedStudentId: string; assignment: ResolvedAttemptAssignment | null }> {
  if (!input.assignmentId) {
    return { resolvedStudentId: input.requestedStudentId, assignment: null };
  }

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: input.assignmentId,
      student: { parentId: input.parentId },
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      contentId: true,
      content: { select: { contentType: true, contentJson: true } },
    },
  });

  return {
    resolvedStudentId: assignment?.studentId ?? input.requestedStudentId,
    assignment,
  };
}

export async function upsertLearningDnaProfileFromAttempt(
  prisma: AttemptPipelineDb,
  childId: string,
  signal: LearningDnaAttemptSignal,
): Promise<{ childId: string; nextProfileJson: string }> {
  const existingStudentProfile = await prisma.studentProfile.findUnique({
    where: { childId },
    select: { id: true, aiLearningProfileJson: true },
  });

  const { nextProfileJson } = updateLearningDnaFromAttempt(existingStudentProfile?.aiLearningProfileJson, signal);

  if (existingStudentProfile) {
    await prisma.studentProfile.update({
      where: { id: existingStudentProfile.id },
      data: { aiLearningProfileJson: nextProfileJson },
    });
  } else {
    await prisma.studentProfile.create({
      data: {
        childId,
        aiLearningProfileJson: nextProfileJson,
      },
    });
  }

  return { childId, nextProfileJson };
}