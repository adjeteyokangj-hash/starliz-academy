import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { fromDbRecord } from "@/lib/child_profile_db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const child = await prisma.childProfile.findFirst({ where: { id, parentId: session.userId } });
  if (!child) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const [progressRecords, questionHistory] = await Promise.all([
    prisma.progressRecord.findMany({ where: { childId: id }, orderBy: { createdAt: "asc" } }),
    prisma.questionHistory.findMany({ where: { childId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  const data = {
    child: fromDbRecord(child),
    progressRecords,
    history: progressRecords.map((record) => ({
      ts: record.createdAt.toISOString(),
      activity: record.activityType,
      score: record.score ?? 0,
      correct: record.correct ?? false,
      difficulty: record.difficulty ?? 1,
      notes: record.notes,
    })),
    questionHistory,
  };

  if (format === "csv") {
    const header = "timestamp,activityType,activityName,starsEarned,xpEarned,coinsEarned,score,correct,difficulty,notes,accuracy,completed";
    const rows = progressRecords.map((record) => [
      record.createdAt.toISOString(),
      record.activityType,
      record.activityName,
      String(record.starsEarned),
      String(record.xpEarned),
      String(record.coinsEarned),
      String(record.score ?? ""),
      String(record.correct ?? ""),
      String(record.difficulty ?? ""),
      String(record.notes ?? ""),
      String(record.accuracy ?? ""),
      String(record.completed),
    ].join(","));
    const csv = [header, ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=child-${id}-export.csv`,
      },
    });
  }

  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename=child-${id}-export.json`,
    },
  });
}
