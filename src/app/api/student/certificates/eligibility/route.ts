import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { getProgressionDecisionBrainView } from "@/lib/student-learning-brain";
import { buildCertificateEligibility } from "@/lib/certificate-eligibility";
import { mergeIssuedCertificateRecords, parseIssuedCertificates } from "@/lib/certificate-issuing";
import { listPersistedCertificateRecordsForStudent } from "@/lib/certificate-records";

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

  const params = new URL(request.url).searchParams;
  const studentId = params.get("studentId")?.trim() || await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const decisionBrain = await getProgressionDecisionBrainView({ studentId, parentId: parentScope.parentId });
  if (!decisionBrain) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const term = resolveAcademicTerm(params.get("term"));
  const student = decisionBrain.student;

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const issuedCertificates = mergeIssuedCertificateRecords(
    await listPersistedCertificateRecordsForStudent(student.id),
    parseIssuedCertificates(profileJson),
  );
  const quick = decisionBrain.quick;

  if (!quick || quick.status !== "completed") {
    const payload = buildCertificateEligibility({
      studentId: student.id,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
      term,
      selectedSubjects: decisionBrain.selectedSubjects,
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
  const assignments = decisionBrain.assignments.map((row) => ({
    status: row.status,
    contentType: row.content.contentType,
    topic: row.content.topic,
    skillFocus: row.content.skillFocus,
    metadataJson: row.content.metadataJson,
  }));

  const eligibility = buildCertificateEligibility({
    studentId: student.id,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    term,
    selectedSubjects: decisionBrain.selectedSubjects,
    placementLevels: quick.levels,
    progressionRecommendations: decisionBrain.progression?.recommendations ?? [],
    assignments,
    attempts: decisionBrain.attempts,
    weakAreas: decisionBrain.weakAreas,
    studentSkills: decisionBrain.studentSkills,
    progressRecords: decisionBrain.progressRecords,
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
