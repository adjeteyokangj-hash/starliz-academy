import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { buildSpellingContentGovernanceReport } from "@/lib/content-governance";

export async function GET() {
  const { session, response } = await requireAdminPermission("content:approve");
  if (!session) return response;

  const spellingRecords = await prisma.aIContentCache.findMany({
    where: { contentType: "spelling" },
    include: {
      assignments: {
        include: {
          student: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

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

  return NextResponse.json({
    ...report,
    source: "admin-content-governance",
    scannedAt: new Date().toISOString(),
  });
}