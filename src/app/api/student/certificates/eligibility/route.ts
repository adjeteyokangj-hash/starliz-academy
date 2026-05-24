import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { parseSelectedSubjectsFromProfileJson, parseSubjectFocus } from "@/lib/student-learning-state";
import { buildSubjectLevelProgression } from "@/lib/subject-level-progression";
import { buildCertificateEligibility } from "@/lib/certificate-eligibility";
import { parseIssuedCertificates } from "@/lib/certificate-issuing";

function resolveAcademicTerm(raw: string | null): string {
  const normalized = String(raw ?? "").trim();
  if (normalized) return normalized;
  const now = new Date();
  const month = now.getMonth() + 1;
  if (month >= 9 && month <= 12) return "Autumn";
  if (month >= 1 && month <= 4) return "Spring";
  return "Summer";
}

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

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

  const params = new URL(request.url).searchParams;
  const term = resolveAcademicTerm(params.get("term"));

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const issuedCertificates = parseIssuedCertificates(profileJson);
  const selectedSubjects = parseSelectedSubjectsFromProfileJson(profileJson).length
    ? parseSelectedSubjectsFromProfileJson(profileJson)
    : parseSubjectFocus(student.studentProfile?.subjectFocus ?? null);

  const quick = parseQuickLevelFinderSession(profileJson);

  if (!quick || quick.status !== "completed") {
    const payload = buildCertificateEligibility({
      studentId: student.id,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
      term,
      selectedSubjects,
      placementLevels: {},
      progressionRecommendations: [],
      assignments: [],
      attempts: [],
      weakAreas: [],
      studentSkills: [],
      progressRecords: [],
    });

    return NextResponse.json({
      ok: false,
      code: "placement_required",
      student: {
        id: student.id,
        name: student.name,
        yearGroup: student.yearGroup,
        keyStage: student.studentProfile?.keyStageLevel ?? null,
      },
      ...payload,
    }, { status: 409 });
  }

  const [attempts, assignments, weakAreas, studentSkills, progressRecords] = await Promise.all([
    prisma.attempt.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      take: 800,
      select: {
        subject: true,
        skillFocus: true,
        correct: true,
      },
    }),
    prisma.assignment.findMany({
      where: {
        studentId: student.id,
        student: { parentId: parentScope.parentId },
      },
      orderBy: { updatedAt: "desc" },
      take: 450,
      select: {
        status: true,
        content: {
          select: {
            contentType: true,
            topic: true,
            skillFocus: true,
            metadataJson: true,
          },
        },
      },
    }),
    prisma.weakArea.findMany({
      where: { studentId: student.id },
      orderBy: { updatedAt: "desc" },
      take: 320,
      select: {
        subject: true,
        skillFocus: true,
        status: true,
      },
    }),
    prisma.studentSkill.findMany({
      where: { studentId: student.id },
      orderBy: { updatedAt: "desc" },
      take: 280,
      select: {
        skill: true,
        status: true,
        accuracy: true,
        attempts: true,
      },
    }),
    prisma.progressRecord.findMany({
      where: { childId: student.id },
      orderBy: { createdAt: "desc" },
      take: 520,
      select: {
        activityType: true,
        activityName: true,
        score: true,
        accuracy: true,
        completed: true,
      },
    }),
  ]);

  const progression = buildSubjectLevelProgression({
    studentId: student.id,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    selectedSubjects,
    placementLevels: quick.levels,
    attempts,
    assignments: assignments.map((row) => ({
      status: row.status,
      contentType: row.content.contentType,
      topic: row.content.topic,
      skillFocus: row.content.skillFocus,
      metadataJson: row.content.metadataJson,
    })),
    weakAreas,
    studentSkills,
    progressRecords,
  });

  const eligibility = buildCertificateEligibility({
    studentId: student.id,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    term,
    selectedSubjects,
    placementLevels: quick.levels,
    progressionRecommendations: progression.recommendations,
    assignments: assignments.map((row) => ({
      status: row.status,
      contentType: row.content.contentType,
      topic: row.content.topic,
      skillFocus: row.content.skillFocus,
      metadataJson: row.content.metadataJson,
    })),
    attempts,
    weakAreas,
    studentSkills,
    progressRecords,
    existingIssuedCertificates: issuedCertificates
      .map((row) => row.certificateType)
      .filter((type): type is "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate" => type !== "award_certificate"),
  });

  return NextResponse.json({
    ok: true,
    student: {
      id: student.id,
      name: student.name,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    },
    issuedCertificates,
    ...eligibility,
  });
}
