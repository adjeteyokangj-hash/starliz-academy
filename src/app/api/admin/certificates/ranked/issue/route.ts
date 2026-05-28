import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { issueAndPersistRankedCertificateRecord } from "@/lib/certificate-records";
import {
  isRankedCertificateType,
  rankLabelForCertificate,
  rankedAwardSourceType,
  type RankingMethod,
} from "@/lib/ranked-certificates";

function resolveBaseUrl(request: Request): string {
  const envUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "").trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function stringValue(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function rankingMethodValue(value: unknown): RankingMethod {
  const normalized = stringValue(value);
  if (
    normalized === "standard"
    || normalized === "dense"
    || normalized === "competition"
    || normalized === "admin_adjusted"
  ) {
    return normalized;
  }
  return "admin_adjusted";
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("content:edit");
  if (!session) return response;

  const body = await request.json().catch(() => ({}));
  const raw = body as Record<string, unknown>;
  const studentId = stringValue(raw.studentId);
  const certificateType = stringValue(raw.certificateType);

  if (!studentId) {
    return NextResponse.json({ ok: false, error: "studentId is required." }, { status: 400 });
  }

  if (!certificateType || !isRankedCertificateType(certificateType)) {
    return NextResponse.json({ ok: false, error: "Valid ranked certificateType is required." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, archived: false },
    select: {
      id: true,
      name: true,
      yearGroup: true,
      studentProfile: {
        select: {
          keyStageLevel: true,
        },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ ok: false, error: "Student not found." }, { status: 404 });
  }

  const rank = numberValue(raw.rank);
  const rankLabel = rankLabelForCertificate({
    certificateType,
    rank,
    rankLabel: stringValue(raw.rankLabel),
  });
  const awardSourceType = stringValue(raw.awardSourceType) ?? rankedAwardSourceType(certificateType);
  const awardSourceId = stringValue(raw.awardSourceId)
    ?? stringValue(raw.competitionName)
    ?? stringValue(raw.testName);

  if (!awardSourceId) {
    return NextResponse.json({
      ok: false,
      error: "awardSourceId, competitionName, or testName is required for duplicate-safe ranked issuing.",
    }, { status: 400 });
  }

  const issued = await issueAndPersistRankedCertificateRecord({
    certificateType,
    studentId: student.id,
    studentName: student.name,
    yearGroup: stringValue(raw.yearGroup) ?? student.yearGroup,
    keyStage: student.studentProfile?.keyStageLevel ?? null,
    level: stringValue(raw.level),
    term: stringValue(raw.term),
    title: stringValue(raw.title),
    awardReason: stringValue(raw.awardReason),
    awardSourceType,
    awardSourceId,
    competitionName: stringValue(raw.competitionName),
    testName: stringValue(raw.testName),
    subject: stringValue(raw.subject),
    strand: stringValue(raw.strand),
    score: numberValue(raw.score),
    rank,
    rankLabel,
    tiedRank: booleanValue(raw.tiedRank) ?? false,
    rankingMethod: rankingMethodValue(raw.rankingMethod),
    verificationBaseUrl: resolveBaseUrl(request),
  });

  return NextResponse.json({
    ok: true,
    message: "Ranked certificate issued.",
    issuedCertificate: issued,
    duplicatePrevention: {
      studentId: student.id,
      certificateType,
      awardSourceType,
      awardSourceId,
      rankLabel,
    },
  });
}
