import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { parseSelectedSubjectsFromProfileJson, parseSubjectFocus } from "@/lib/student-learning-state";
import { buildSubjectLevelProgression } from "@/lib/subject-level-progression";
import { buildCertificateEligibility, type CertificateType } from "@/lib/certificate-eligibility";
import {
  canIssueCertificate,
  findMatchingIssuedCertificate,
  mergeIssuedCertificateRecords,
  parseIssuedCertificates,
  upsertIssuedCertificates,
} from "@/lib/certificate-issuing";
import {
  issueAndPersistCertificateRecord,
  listPersistedCertificateRecordsForStudent,
} from "@/lib/certificate-records";

function resolveAcademicTerm(raw: string | null | undefined): string {
  const normalized = String(raw ?? "").trim();
  if (normalized) return normalized;
  const now = new Date();
  const month = now.getMonth() + 1;
  if (month >= 9 && month <= 12) return "Autumn";
  if (month >= 1 && month <= 4) return "Spring";
  return "Summer";
}

function parseCertificateType(raw: unknown): CertificateType | null {
  const value = String(raw ?? "").trim();
  if (
    value === "term_completion"
    || value === "end_of_term_exam"
    || value === "subject_achievement"
    || value === "english_achievement"
    || value === "mastery_certificate"
  ) {
    return value;
  }
  return null;
}

function resolveBaseUrl(request: Request): string {
  const envUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "").trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const certificateType = parseCertificateType((body as Record<string, unknown>).certificateType);
  const term = resolveAcademicTerm((body as Record<string, unknown>).term as string | null | undefined);

  if (!certificateType) {
    return NextResponse.json({ error: "Valid certificateType is required." }, { status: 400 });
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

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const selectedSubjects = parseSelectedSubjectsFromProfileJson(profileJson).length
    ? parseSelectedSubjectsFromProfileJson(profileJson)
    : parseSubjectFocus(student.studentProfile?.subjectFocus ?? null);

  const quick = parseQuickLevelFinderSession(profileJson);
  if (!quick || quick.status !== "completed") {
    return NextResponse.json({
      ok: false,
      code: "placement_required",
      message: "Complete Quick Level Finder before requesting certificate issuance.",
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

  const persistedIssued = await listPersistedCertificateRecordsForStudent(student.id);
  const legacyIssued = parseIssuedCertificates(profileJson);
  const existingIssued = mergeIssuedCertificateRecords(persistedIssued, legacyIssued);

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
    existingIssuedCertificates: existingIssued
      .map((row) => row.certificateType)
      .filter((type): type is "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate" => type !== "award_certificate"),
  });

  const target = eligibility.certificates.find((row) => row.certificateType === certificateType);
  if (!target) {
    return NextResponse.json({ error: "Certificate type was not found for this student profile." }, { status: 404 });
  }

  const existingTarget = findMatchingIssuedCertificate({
    records: existingIssued,
    studentId: student.id,
    certificateType,
    term,
  });

  if (existingTarget) {
    return NextResponse.json({
      ok: true,
      message: "Certificate already issued.",
      student: {
        id: student.id,
        name: student.name,
        yearGroup: student.yearGroup,
        keyStage: student.studentProfile?.keyStageLevel ?? null,
      },
      issuedCertificate: existingTarget,
    });
  }

  const gate = canIssueCertificate(target);
  if (!gate.ok) {
    return NextResponse.json({
      ok: false,
      code: "not_eligible",
      message: gate.reason,
      certificateType,
      status: gate.eligibilityStatus,
      blockers: target.blockers,
      nextBestAction: target.nextBestAction,
      readinessScore: target.readinessScore,
    }, { status: 409 });
  }

  const baseUrl = resolveBaseUrl(request);
  const issued = await issueAndPersistCertificateRecord({
    eligibility: target,
    studentId: student.id,
    studentName: student.name,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    verificationBaseUrl: baseUrl,
  });

  const updatedIssued = mergeIssuedCertificateRecords([issued], existingIssued);

  await prisma.studentProfile.upsert({
    where: { childId: student.id },
    create: {
      childId: student.id,
      aiLearningProfileJson: upsertIssuedCertificates(profileJson, updatedIssued),
    },
    update: {
      aiLearningProfileJson: upsertIssuedCertificates(profileJson, updatedIssued),
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Certificate issued successfully.",
    student: {
      id: student.id,
      name: student.name,
      yearGroup: student.yearGroup,
      keyStage: student.studentProfile?.keyStageLevel ?? null,
    },
    issuedCertificate: issued,
  });
}
