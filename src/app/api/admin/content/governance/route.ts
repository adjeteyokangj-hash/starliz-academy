import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { buildSpellingContentGovernanceReport } from "@/lib/content-governance";
import { summarizeQuestionDuplicatesForContent } from "@/lib/question-duplicate-detection";

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("content:approve");
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const contentId = searchParams.get("contentId")?.trim() ?? "";

  if (contentId) {
    const [record, allRecords] = await Promise.all([
      prisma.aIContentCache.findUnique({
        where: { id: contentId },
        select: {
          id: true,
          status: true,
          contentType: true,
          keyStage: true,
          yearGroup: true,
          contentJson: true,
        },
      }),
      prisma.aIContentCache.findMany({
        select: {
          id: true,
          status: true,
          contentType: true,
          keyStage: true,
          yearGroup: true,
          contentJson: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!record) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }

    return NextResponse.json({
      contentId,
      questionDuplicateSummary: summarizeQuestionDuplicatesForContent({
        contentId: record.id,
        contentStatus: record.status,
        contentSubject: record.contentType,
        contentYearGroup: record.yearGroup,
        contentKeyStage: record.keyStage,
        contentJson: record.contentJson,
        historicalRecords: allRecords
          .filter((other) => other.id !== record.id)
          .map((other) => ({
            contentId: other.id,
            contentStatus: other.status,
            contentSubject: other.contentType,
            contentYearGroup: other.yearGroup,
            contentKeyStage: other.keyStage,
            contentJson: other.contentJson,
          })),
      }),
      source: "admin-content-governance",
      scannedAt: new Date().toISOString(),
    });
  }

  const allRecords = await prisma.aIContentCache.findMany({
    include: {
      assignments: {
        include: {
          student: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const spellingRecords = allRecords.filter((record) => record.contentType === "spelling");

  const report = buildSpellingContentGovernanceReport(
    spellingRecords.map((record) => ({
      id: record.id,
      contentType: record.contentType,
      createdAt: record.createdAt.toISOString(),
      createdBy: record.createdBy,
      topic: record.topic,
      level: record.level,
      metadataJson: record.metadataJson,
      contentJson: record.contentJson,
      assignments: record.assignments.map((assignment) => ({
        assignmentId: assignment.id,
        studentId: assignment.studentId,
        studentName: assignment.student?.name ?? null,
        assignmentStatus: assignment.status,
        assignmentCreatedAt: assignment.createdAt.toISOString(),
      })),
    })),
  );

  const questionDuplicateSummaries = Object.fromEntries(
    allRecords.map((record) => [
      record.id,
      summarizeQuestionDuplicatesForContent({
        contentId: record.id,
        contentStatus: record.status,
        contentSubject: record.contentType,
        contentYearGroup: record.yearGroup,
        contentKeyStage: record.keyStage,
        contentJson: record.contentJson,
        historicalRecords: allRecords
          .filter((other) => other.id !== record.id)
          .map((other) => ({
            contentId: other.id,
            contentStatus: other.status,
            contentSubject: other.contentType,
            contentYearGroup: other.yearGroup,
            contentKeyStage: other.keyStage,
            contentJson: other.contentJson,
          })),
      }),
    ]),
  );

  return NextResponse.json({
    ...report,
    questionDuplicateSummaries,
    source: "admin-content-governance",
    scannedAt: new Date().toISOString(),
  });
}