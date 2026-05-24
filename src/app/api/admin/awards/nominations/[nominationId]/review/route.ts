import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { parseSelectedSubjectsFromProfileJson, parseSubjectFocus } from "@/lib/student-learning-state";
import { buildSubjectLevelProgression } from "@/lib/subject-level-progression";
import { buildCertificateEligibility } from "@/lib/certificate-eligibility";
import {
  issueAwardCertificateRecord,
  parseIssuedCertificates,
  upsertIssuedCertificates,
} from "@/lib/certificate-issuing";
import {
  buildStudentAwardNominations,
  canApproveAwardNomination,
  canIssueAwardCertificate,
  type StudentAwardNomination,
} from "@/lib/student-awards";
import {
  parseAwardReviewDecisions,
  upsertAwardReviewDecision,
} from "@/lib/award-review-state";

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

function resolveAcademicYear(raw: string | null): string {
  const value = String(raw ?? "").trim();
  if (/^\d{4}\/\d{4}$/.test(value)) return value;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 9 ? year : year - 1;
  return `${start}/${start + 1}`;
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

function resolveBaseUrl(request: Request): string {
  const envUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "").trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function recomputeNomination(input: {
  studentId: string;
  nominationId: string;
  term: "Autumn" | "Spring" | "Summer";
  academicYear: string;
}): Promise<{ nomination: StudentAwardNomination | null; profileJson: string | null; studentName: string; yearGroup: string | null; keyStage: string | null }> {
  const window = termWindow({ term: input.term, academicYear: input.academicYear });

  const student = await prisma.childProfile.findFirst({
    where: { id: input.studentId, archived: false },
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
    return { nomination: null, profileJson: null, studentName: "", yearGroup: null, keyStage: null };
  }

  const profileJson = student.studentProfile?.aiLearningProfileJson ?? null;
  const selectedSubjects = parseSelectedSubjectsFromProfileJson(profileJson).length
    ? parseSelectedSubjectsFromProfileJson(profileJson)
    : parseSubjectFocus(student.studentProfile?.subjectFocus ?? null);

  const quick = parseQuickLevelFinderSession(profileJson);

  const [attempts, assignments, weakAreas, studentSkills, progressRecords] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        studentId: student.id,
        createdAt: { gte: window.start, lte: window.end },
      },
      orderBy: { createdAt: "desc" },
      select: {
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
        studentId: student.id,
        updatedAt: { gte: window.start, lte: window.end },
      },
      orderBy: { updatedAt: "desc" },
      select: {
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
        studentId: student.id,
        updatedAt: { gte: window.start, lte: window.end },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        subject: true,
        skillFocus: true,
        status: true,
        accuracy: true,
        attemptsCount: true,
      },
    }),
    prisma.studentSkill.findMany({
      where: {
        studentId: student.id,
        updatedAt: { gte: window.start, lte: window.end },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        skill: true,
        status: true,
        accuracy: true,
        attempts: true,
      },
    }),
    prisma.progressRecord.findMany({
      where: {
        childId: student.id,
        createdAt: { gte: window.start, lte: window.end },
      },
      orderBy: { createdAt: "desc" },
      select: {
        activityType: true,
        activityName: true,
        score: true,
        accuracy: true,
        completed: true,
        createdAt: true,
      },
    }),
  ]);

  const assignmentRows = assignments.map((row) => ({
    status: row.status,
    contentType: row.content.contentType,
    topic: row.content.topic,
    skillFocus: row.content.skillFocus,
    metadataJson: row.content.metadataJson,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const progression = buildSubjectLevelProgression({
    studentId: student.id,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    selectedSubjects,
    placementLevels: quick?.levels ?? {},
    attempts,
    assignments: assignmentRows,
    weakAreas,
    studentSkills,
    progressRecords,
  });

  const existingIssuedCertificates = parseIssuedCertificates(profileJson)
    .map((row) => row.certificateType)
    .filter((type): type is "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate" => type !== "award_certificate");

  const certificateEligibility = buildCertificateEligibility({
    studentId: student.id,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    term: input.term,
    selectedSubjects,
    placementLevels: quick?.levels ?? {},
    progressionRecommendations: progression.recommendations,
    assignments: assignmentRows,
    attempts,
    weakAreas,
    studentSkills,
    progressRecords,
    existingIssuedCertificates,
  });

  const nominations = buildStudentAwardNominations({
    studentId: student.id,
    studentName: student.name,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    term: input.term,
    academicYear: input.academicYear,
    placementLevels: quick?.levels ?? {},
    progressionRecommendations: progression.recommendations,
    certificateEligibility,
    certificateIssuedState: existingIssuedCertificates,
    assignments: assignmentRows,
    attempts,
    weakAreas,
    studentSkills,
    progressRecords,
    selectedSubjects,
  });

  return {
    nomination: nominations.find((row) => row.nominationId === input.nominationId) ?? null,
    profileJson,
    studentName: student.name,
    yearGroup: student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ nominationId: string }> },
) {
  const { session, response } = await requireAdminPermission("content:edit");
  if (!session) return response;

  const { nominationId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = String((body as Record<string, unknown>).action ?? "").trim();
  const studentId = String((body as Record<string, unknown>).studentId ?? "").trim();
  const term = resolveAcademicTerm((body as Record<string, unknown>).term as string | null);
  const academicYear = resolveAcademicYear((body as Record<string, unknown>).academicYear as string | null);
  const reason = String((body as Record<string, unknown>).reason ?? "").trim();
  const reviewNote = String((body as Record<string, unknown>).reviewNote ?? "").trim();

  if (!nominationId || !studentId) {
    return NextResponse.json({ error: "nominationId and studentId are required." }, { status: 400 });
  }

  if (action !== "approve" && action !== "reject" && action !== "issue_award_certificate") {
    return NextResponse.json({ error: "Action must be approve, reject, or issue_award_certificate." }, { status: 400 });
  }

  const resolved = await recomputeNomination({
    studentId,
    nominationId,
    term,
    academicYear,
  });

  if (!resolved.nomination || !resolved.profileJson) {
    return NextResponse.json({ error: "Nomination not found for current live evidence scope." }, { status: 404 });
  }

  const decisions = parseAwardReviewDecisions(resolved.profileJson);
  const currentDecision = decisions.find((row) => row.nominationId === nominationId) ?? null;

  if (action === "reject") {
    if (!reason || reason.length < 8) {
      return NextResponse.json({ error: "Rejection reason is required and must be meaningful." }, { status: 400 });
    }

    const nextProfileJson = upsertAwardReviewDecision({
      profileJson: resolved.profileJson,
      decision: {
        nominationId,
        status: "rejected",
        reason,
        reviewedAt: new Date().toISOString(),
        reviewedBy: session.userId,
      },
    });

    await prisma.studentProfile.upsert({
      where: { childId: studentId },
      create: {
        childId: studentId,
        aiLearningProfileJson: nextProfileJson,
      },
      update: {
        aiLearningProfileJson: nextProfileJson,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Nomination rejected.",
      limitationNote: "Nomination approval is currently calculated from live evidence until a dedicated award table is added.",
      nomination: {
        ...resolved.nomination,
        status: "rejected",
      },
    });
  }

  if (action === "approve") {
    const approveGate = canApproveAwardNomination({
      nomination: resolved.nomination,
      reviewNote,
      notEnoughEvidence: !resolved.nomination.eligibleForNomination,
    });

    if (!approveGate.ok) {
      return NextResponse.json({
        ok: false,
        error: approveGate.reason ?? "Nomination cannot be approved.",
        blockers: resolved.nomination.blockers,
      }, { status: 409 });
    }

    const nextProfileJson = upsertAwardReviewDecision({
      profileJson: resolved.profileJson,
      decision: {
        nominationId,
        status: "approved",
        reason: reviewNote || null,
        reviewedAt: new Date().toISOString(),
        reviewedBy: session.userId,
      },
    });

    await prisma.studentProfile.upsert({
      where: { childId: studentId },
      create: {
        childId: studentId,
        aiLearningProfileJson: nextProfileJson,
      },
      update: {
        aiLearningProfileJson: nextProfileJson,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Nomination approved. Award certificate may now be issued.",
      limitationNote: "Nomination approval is currently calculated from live evidence until a dedicated award table is added.",
      nomination: {
        ...resolved.nomination,
        status: "approved",
      },
    });
  }

  if (currentDecision?.status !== "approved") {
    return NextResponse.json({
      ok: false,
      error: "Only approved nominations can issue an award certificate.",
      nominationStatus: currentDecision?.status ?? "pending_review",
    }, { status: 409 });
  }

  const issueGate = canIssueAwardCertificate({
    nomination: resolved.nomination,
    nominationStatus: "approved",
    notEnoughEvidence: !resolved.nomination.eligibleForNomination,
  });

  if (!issueGate.ok) {
    return NextResponse.json({
      ok: false,
      error: issueGate.reason ?? "Nomination is not eligible for issuing.",
      blockers: resolved.nomination.blockers,
    }, { status: 409 });
  }

  const existingIssued = parseIssuedCertificates(resolved.profileJson);
  const existingAward = existingIssued.find((row) => row.certificateType === "award_certificate" && row.nominationId === nominationId);

  if (existingAward) {
    return NextResponse.json({
      ok: true,
      message: "Award certificate already issued.",
      limitationNote: "Nomination approval is currently calculated from live evidence until a dedicated award table is added.",
      nomination: {
        ...resolved.nomination,
        status: "approved",
      },
      issuedAwardCertificate: existingAward,
    });
  }

  const issued = issueAwardCertificateRecord({
    nomination: resolved.nomination,
    studentId,
    studentName: resolved.studentName,
    yearGroup: resolved.yearGroup,
    keyStage: resolved.keyStage,
    verificationBaseUrl: resolveBaseUrl(request),
  });

  const nextProfileJson = upsertIssuedCertificates(resolved.profileJson, [...existingIssued, issued]);

  await prisma.studentProfile.upsert({
    where: { childId: studentId },
    create: {
      childId: studentId,
      aiLearningProfileJson: nextProfileJson,
    },
    update: {
      aiLearningProfileJson: nextProfileJson,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Award certificate issued successfully.",
    limitationNote: "Nomination approval is currently calculated from live evidence until a dedicated award table is added.",
    nomination: {
      ...resolved.nomination,
      status: "approved",
    },
    issuedAwardCertificate: issued,
  });
}
