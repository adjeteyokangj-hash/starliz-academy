import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import {
  autoQuickLevelFinderSubjectsForYearGroup,
  buildQuestionPlan,
  normaliseScopedSubjectKeyForQlf,
  parseQuickLevelFinderSession,
  quickLevelFinderQuestionRangeForYearGroup,
  sanitiseQuestion,
  upsertQuickLevelFinderSession,
} from "@/lib/quick-level-finder";

type StartBody = {
  restart?: boolean;
};

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  let body: StartBody = {};
  try {
    body = (await request.json()) as StartBody;
  } catch {
    body = {};
  }
  const restart = body.restart === true;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const studentId = await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      id: true,
      name: true,
      yearGroup: true,
      studentProfile: {
        select: {
          keyStageLevel: true,
          subjectFocus: true,
          aiLearningProfileJson: true,
        },
      },
    },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const coreSelectedSubjects = autoQuickLevelFinderSubjectsForYearGroup(student.yearGroup);
  const scopedSubjects = coreSelectedSubjects.map((subject) => normaliseScopedSubjectKeyForQlf(subject));
  const questionRange = quickLevelFinderQuestionRangeForYearGroup(student.yearGroup);
  const questionCount = questionRange.max;
  const existingProfileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const existingSession = parseQuickLevelFinderSession(existingProfileJson);
  const existingCurrentQuestion = existingSession
    ? existingSession.questions[existingSession.cursor] ?? null
    : null;

  if (existingSession && existingSession.status === "in_progress" && !restart && existingCurrentQuestion) {
    const safeCurrentQuestion = sanitiseQuestion(existingCurrentQuestion, existingSession.cursor);
    if (safeCurrentQuestion !== existingCurrentQuestion) {
      console.warn(`[qlf-start] Repaired resumed question for student ${student.id} (${student.yearGroup})`);
    }
    return NextResponse.json({
      ok: true,
      resumed: true,
      student: {
        id: student.id,
        name: student.name,
        yearGroup: student.yearGroup,
        keyStage: student.studentProfile?.keyStageLevel ?? null,
      },
      selection: {
        parentSubjects: existingSession.selectedSubjects,
        scopedSubjects: existingSession.scopedSubjects,
      },
      testDesign: {
        adaptive: true,
        questionCountMin: questionRange.min,
        questionCountMax: questionRange.max,
        note: "Quick diagnostic subjects and question count are adapted by year group.",
      },
      session: {
        sessionId: existingSession.sessionId,
        status: existingSession.status,
        answered: existingSession.responses.length,
        totalQuestions: existingSession.questions.length,
        currentQuestion: safeCurrentQuestion,
        questionPreview: existingSession.questions.slice(existingSession.cursor, existingSession.cursor + 3),
      },
    });
  }

  const nextSessionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const nextSession = {
    sessionId: nextSessionId,
    status: "in_progress" as const,
    startedAt: new Date().toISOString(),
    completedAt: null,
    selectedSubjects: coreSelectedSubjects,
    scopedSubjects,
    questions: buildQuestionPlan({
      scopedSubjects,
      count: questionCount,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
      sessionId: nextSessionId,
    }),
    cursor: 0,
    responses: [],
    levels: {},
  };
  const nextProfileJson = upsertQuickLevelFinderSession(existingProfileJson, nextSession);

  await prisma.studentProfile.upsert({
    where: { childId: student.id },
    update: { aiLearningProfileJson: nextProfileJson },
    create: {
      childId: student.id,
      aiLearningProfileJson: nextProfileJson,
      subjectFocus: student.studentProfile?.subjectFocus ?? null,
      keyStageLevel: student.studentProfile?.keyStageLevel ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    resumed: false,
    student: {
      id: student.id,
      name: student.name,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    },
    selection: {
      parentSubjects: coreSelectedSubjects,
      scopedSubjects,
      scopedSubjectKeys: scopedSubjects,
    },
    testDesign: {
      adaptive: true,
      questionCountMin: questionRange.min,
      questionCountMax: questionRange.max,
      note: "Quick diagnostic subjects and question count are adapted by year group.",
    },
    session: {
      sessionId: nextSession.sessionId,
      status: nextSession.status,
      answered: 0,
      totalQuestions: nextSession.questions.length,
      currentQuestion: nextSession.questions[0] ?? null,
      questionPreview: nextSession.questions.slice(0, 3),
    },
  });
}
