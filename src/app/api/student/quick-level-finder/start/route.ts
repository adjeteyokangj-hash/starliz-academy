import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { parseSelectedSubjectsFromProfileJson, parseSubjectFocus } from "@/lib/student-learning-state";
import { quickLevelFinderSubjects, sanitizeSelectedSubjects } from "@/lib/subject-selection";
import {
  buildQuestionPlan,
  parseQuickLevelFinderSession,
  questionRangeBySubjectCount,
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

  const selectedSubjects = parseSelectedSubjectsFromProfileJson(student.studentProfile?.aiLearningProfileJson ?? null).length
    ? parseSelectedSubjectsFromProfileJson(student.studentProfile?.aiLearningProfileJson ?? null)
    : parseSubjectFocus(student.studentProfile?.subjectFocus ?? null);

  if (!selectedSubjects.length) {
    return NextResponse.json({ error: "Subject selection is required before Quick Level Finder." }, { status: 409 });
  }

  const scopedSubjects = quickLevelFinderSubjects(sanitizeSelectedSubjects(selectedSubjects));
  const scopedSubjectKeys = scopedSubjects.map((entry) => (entry.strand ? `${entry.subject}:${entry.strand}` : entry.subject));
  const questionRange = questionRangeBySubjectCount(selectedSubjects.length);
  const questionCount = Math.round((questionRange.min + questionRange.max) / 2);
  const existingProfileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const existingSession = parseQuickLevelFinderSession(existingProfileJson);

  if (existingSession && existingSession.status === "in_progress" && !restart) {
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
        note: "Questions are generated only from selected subjects. English expands into internal strands.",
      },
      session: {
        sessionId: existingSession.sessionId,
        status: existingSession.status,
        answered: existingSession.responses.length,
        totalQuestions: existingSession.questions.length,
        currentQuestion: existingSession.questions[existingSession.cursor] ?? null,
      },
    });
  }

  const nextSession = {
    sessionId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: "in_progress" as const,
    startedAt: new Date().toISOString(),
    completedAt: null,
    selectedSubjects,
    scopedSubjects: scopedSubjectKeys,
    questions: buildQuestionPlan(scopedSubjectKeys, questionCount),
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
      parentSubjects: selectedSubjects,
      scopedSubjects,
      scopedSubjectKeys,
    },
    testDesign: {
      adaptive: true,
      questionCountMin: questionRange.min,
      questionCountMax: questionRange.max,
      note: "Questions are generated only from selected subjects. English expands into internal strands.",
    },
    session: {
      sessionId: nextSession.sessionId,
      status: nextSession.status,
      answered: 0,
      totalQuestions: nextSession.questions.length,
      currentQuestion: nextSession.questions[0] ?? null,
    },
  });
}
