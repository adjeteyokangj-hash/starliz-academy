import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { parseSelectedSubjectsFromProfileJson, parseSubjectFocus } from "@/lib/student-learning-state";
import { buildSubjectLevelProgression } from "@/lib/subject-level-progression";
import { buildCertificateEligibility } from "@/lib/certificate-eligibility";
import { mergeIssuedCertificateRecords, parseIssuedCertificates } from "@/lib/certificate-issuing";
import { listPersistedCertificateRecordsForStudent } from "@/lib/certificate-records";
import { parseAwardReviewDecisions } from "@/lib/award-review-state";
import {
  buildStudentAwardNominations,
  rankAwardNominations,
  type StudentAwardScope,
} from "@/lib/student-awards";
import { currentAcademicYearLabel } from "@/lib/schools/ensure-year-classes";

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function resolveAcademicTerm(raw: string | null): "Autumn" | "Spring" | "Summer" {
  const normalized = normalize(raw);
  if (normalized === "autumn") return "Autumn";
  if (normalized === "spring") return "Spring";
  if (normalized === "summer") return "Summer";

  const month = new Date().getMonth() + 1;
  if (month >= 9 && month <= 12) return "Autumn";
  if (month >= 1 && month <= 4) return "Spring";
  return "Summer";
}

function expandAcademicYearLabel(label: string): string {
  const match = /^(\d{4})\s*\/\s*(\d{2}|\d{4})$/.exec(label.trim());
  if (!match) return label.trim();
  const start = Number(match[1]);
  const endRaw = match[2];
  const end = endRaw.length === 2 ? start + 1 : Number(endRaw);
  return `${start}/${end}`;
}

function resolveAcademicYear(raw: string | null): string {
  const value = String(raw ?? "").trim();
  if (/^\d{4}\/\d{2,4}$/.test(value)) return expandAcademicYearLabel(value);
  return expandAcademicYearLabel(currentAcademicYearLabel());
}

function termWindow(input: { term: "Autumn" | "Spring" | "Summer"; academicYear: string }): { start: Date; end: Date } {
  const [startYearRaw] = input.academicYear.split("/");
  const startYear = Number.parseInt(startYearRaw, 10);
  if (!Number.isFinite(startYear)) {
    const fallback = new Date();
    const nowYear = fallback.getFullYear();
    return { start: new Date(Date.UTC(nowYear, 0, 1)), end: fallback };
  }

  if (input.term === "Autumn") {
    return { start: new Date(Date.UTC(startYear, 8, 1)), end: new Date(Date.UTC(startYear, 11, 31, 23, 59, 59, 999)) };
  }
  if (input.term === "Spring") {
    return { start: new Date(Date.UTC(startYear + 1, 0, 1)), end: new Date(Date.UTC(startYear + 1, 3, 30, 23, 59, 59, 999)) };
  }
  return { start: new Date(Date.UTC(startYear + 1, 4, 1)), end: new Date(Date.UTC(startYear + 1, 7, 31, 23, 59, 59, 999)) };
}

function parseScope(raw: string | null): StudentAwardScope | null {
  const value = normalize(raw);
  if (
    value === "platform"
    || value === "year_group"
    || value === "subject"
    || value === "subject_strand"
    || value === "term"
    || value === "academic_year"
  ) {
    return value;
  }
  return null;
}

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const scope = parseScope(params.get("scope"));
  const yearGroup = params.get("yearGroup")?.trim() || null;
  const studentId = params.get("studentId")?.trim() || null;
  const limitRaw = Number.parseInt(params.get("limit") ?? "40", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(120, limitRaw)) : 40;
  const term = resolveAcademicTerm(params.get("term"));
  const academicYear = resolveAcademicYear(params.get("academicYear"));

  const window = termWindow({ term, academicYear });

  const students = await prisma.childProfile.findMany({
    where: {
      archived: false,
      ...(studentId ? { id: studentId } : {}),
      ...(yearGroup ? { yearGroup } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: studentId ? 1 : limit,
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

  if (!students.length) {
    return NextResponse.json({ error: "No students found for this scope." }, { status: 404 });
  }

  const studentIds = students.map((row) => row.id);

  const [attempts, assignments, weakAreas, studentSkills, progressRecords, persistedCertificateGroups] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        studentId: { in: studentIds },
        createdAt: { gte: window.start, lte: window.end },
      },
      orderBy: { createdAt: "desc" },
      select: {
        studentId: true,
        subject: true,
        skillFocus: true,
        correct: true,
        responseTimeMs: true,
        hintsUsed: true,
        createdAt: true,
      },
    }),
    prisma.assignment.findMany({
      where: {
        studentId: { in: studentIds },
        updatedAt: { gte: window.start, lte: window.end },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        studentId: true,
        status: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
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
      where: {
        studentId: { in: studentIds },
        updatedAt: { gte: window.start, lte: window.end },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        studentId: true,
        subject: true,
        skillFocus: true,
        status: true,
        accuracy: true,
        attemptsCount: true,
      },
    }),
    prisma.studentSkill.findMany({
      where: {
        studentId: { in: studentIds },
        updatedAt: { gte: window.start, lte: window.end },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        studentId: true,
        skill: true,
        status: true,
        accuracy: true,
        attempts: true,
      },
    }),
    prisma.progressRecord.findMany({
      where: {
        childId: { in: studentIds },
        createdAt: { gte: window.start, lte: window.end },
      },
      orderBy: { createdAt: "desc" },
      select: {
        childId: true,
        activityType: true,
        activityName: true,
        score: true,
        accuracy: true,
        completed: true,
        createdAt: true,
      },
    }),
    Promise.all(studentIds.map((id) => listPersistedCertificateRecordsForStudent(id))),
  ]);

  const persistedCertificatesByStudent = new Map<string, Awaited<ReturnType<typeof listPersistedCertificateRecordsForStudent>>>();
  studentIds.forEach((id, index) => {
    persistedCertificatesByStudent.set(id, persistedCertificateGroups[index] ?? []);
  });

  const attemptsByStudent = new Map<string, typeof attempts>();
  for (const row of attempts) {
    const list = attemptsByStudent.get(row.studentId) ?? [];
    list.push(row);
    attemptsByStudent.set(row.studentId, list);
  }

  const assignmentsByStudent = new Map<string, typeof assignments>();
  for (const row of assignments) {
    const list = assignmentsByStudent.get(row.studentId) ?? [];
    list.push(row);
    assignmentsByStudent.set(row.studentId, list);
  }

  const weakAreasByStudent = new Map<string, typeof weakAreas>();
  for (const row of weakAreas) {
    const list = weakAreasByStudent.get(row.studentId) ?? [];
    list.push(row);
    weakAreasByStudent.set(row.studentId, list);
  }

  const studentSkillsByStudent = new Map<string, typeof studentSkills>();
  for (const row of studentSkills) {
    const list = studentSkillsByStudent.get(row.studentId) ?? [];
    list.push(row);
    studentSkillsByStudent.set(row.studentId, list);
  }

  const progressByStudent = new Map<string, typeof progressRecords>();
  for (const row of progressRecords) {
    const list = progressByStudent.get(row.childId) ?? [];
    list.push(row);
    progressByStudent.set(row.childId, list);
  }

  const nominationMeta = new Map<string, {
    decision: {
      status: "approved" | "rejected";
      reason: string | null;
      reviewedAt: string;
      reviewedBy: string;
    } | null;
    issuedAwardCertificate: {
      certificateNumber: string;
      verificationCode: string;
      issuedAt: string;
      verificationUrl: string;
    } | null;
  }>();

  const nominations = students.flatMap((student) => {
    const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
    const reviewDecisions = parseAwardReviewDecisions(profileJson);
    const issuedCertificates = mergeIssuedCertificateRecords(
      persistedCertificatesByStudent.get(student.id) ?? [],
      parseIssuedCertificates(profileJson),
    );
    const issuedAwardCertificates = issuedCertificates
      .filter((row) => row.certificateType === "award_certificate");
    const selectedSubjects = parseSelectedSubjectsFromProfileJson(profileJson).length
      ? parseSelectedSubjectsFromProfileJson(profileJson)
      : parseSubjectFocus(student.studentProfile?.subjectFocus ?? null);

    const quick = parseQuickLevelFinderSession(profileJson);

    const studentAttempts = (attemptsByStudent.get(student.id) ?? []).map((row) => ({
      subject: row.subject,
      skillFocus: row.skillFocus,
      correct: row.correct,
      responseTimeMs: row.responseTimeMs,
      hintsUsed: row.hintsUsed,
      createdAt: row.createdAt,
    }));

    const studentAssignments = (assignmentsByStudent.get(student.id) ?? []).map((row) => ({
      status: row.status,
      contentType: row.content.contentType,
      topic: row.content.topic,
      skillFocus: row.content.skillFocus,
      metadataJson: row.content.metadataJson,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    const studentWeakAreas = (weakAreasByStudent.get(student.id) ?? []).map((row) => ({
      subject: row.subject,
      skillFocus: row.skillFocus,
      status: row.status,
      accuracy: row.accuracy,
      attemptsCount: row.attemptsCount,
    }));

    const studentSkillRows = (studentSkillsByStudent.get(student.id) ?? []).map((row) => ({
      skill: row.skill,
      status: row.status,
      accuracy: row.accuracy,
      attempts: row.attempts,
    }));

    const studentProgress = (progressByStudent.get(student.id) ?? []).map((row) => ({
      activityType: row.activityType,
      activityName: row.activityName,
      score: row.score,
      accuracy: row.accuracy,
      completed: row.completed,
      createdAt: row.createdAt,
    }));

    const progression = buildSubjectLevelProgression({
      studentId: student.id,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
      selectedSubjects,
      placementLevels: quick?.levels ?? {},
      attempts: studentAttempts,
      assignments: studentAssignments,
      weakAreas: studentWeakAreas,
      studentSkills: studentSkillRows,
      progressRecords: studentProgress,
    });

    const existingIssuedCertificates = issuedCertificates
      .map((row) => row.certificateType)
      .filter((type): type is "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate" => type !== "award_certificate");
    const certificateEligibility = buildCertificateEligibility({
      studentId: student.id,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
      term,
      selectedSubjects,
      placementLevels: quick?.levels ?? {},
      progressionRecommendations: progression.recommendations,
      assignments: studentAssignments,
      attempts: studentAttempts,
      weakAreas: studentWeakAreas,
      studentSkills: studentSkillRows,
      progressRecords: studentProgress,
      existingIssuedCertificates,
    });

    return buildStudentAwardNominations({
      studentId: student.id,
      studentName: student.name,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
      term,
      academicYear,
      placementLevels: quick?.levels ?? {},
      progressionRecommendations: progression.recommendations,
      certificateEligibility,
      certificateIssuedState: existingIssuedCertificates,
      assignments: studentAssignments,
      attempts: studentAttempts,
      weakAreas: studentWeakAreas,
      studentSkills: studentSkillRows,
      progressRecords: studentProgress,
      selectedSubjects,
    }).map((nomination) => {
      const decision = reviewDecisions.find((row) => row.nominationId === nomination.nominationId);
      const issued = issuedAwardCertificates.find((row) => row.nominationId === nomination.nominationId);

      nominationMeta.set(nomination.nominationId, {
        decision: decision
          ? {
              status: decision.status,
              reason: decision.reason,
              reviewedAt: decision.reviewedAt,
              reviewedBy: decision.reviewedBy,
            }
          : null,
        issuedAwardCertificate: issued
          ? {
              certificateNumber: issued.certificateNumber,
              verificationCode: issued.verificationCode,
              issuedAt: issued.issuedAt,
              verificationUrl: issued.verificationUrl,
            }
          : null,
      });

      return nomination;
    });
  });

  const ranked = rankAwardNominations(nominations)
    .filter((row) => !scope || row.awardScope === scope)
    .filter((row) => !yearGroup || normalize(row.yearGroup) === normalize(yearGroup));

  const enriched = ranked.map((row) => {
    const meta = nominationMeta.get(row.nominationId);
    return {
      ...row,
      status: meta?.decision?.status ?? row.status,
      reviewDecision: meta?.decision ?? null,
      issuedAwardCertificate: meta?.issuedAwardCertificate ?? null,
    };
  });

  const eligibleCount = enriched.filter((row) => row.eligibleForNomination).length;

  return NextResponse.json({
    ok: true,
    code: eligibleCount > 0 ? undefined : "not_enough_evidence",
    message: eligibleCount > 0
      ? "Award nominations generated. All nominations are pending review."
      : "Not enough evidence to generate eligible nominations.",
    limitationNote: "Nomination approval is currently calculated from live evidence until a dedicated award table is added.",
    scope: scope ?? "platform",
    term,
    academicYear,
    reviewRequired: true,
    safeguards: [
      "Awards are nomination-only and require admin review before issuing.",
      "Nominations are evidence-based; score-only outcomes are blocked by safeguards.",
    ],
    summary: {
      studentCount: students.length,
      nominationsCount: enriched.length,
      eligibleCount,
    },
    nominations: enriched,
  });
}
