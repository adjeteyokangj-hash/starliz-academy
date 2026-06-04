import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";

type SessionSignals = {
  learningConfidence?: string;
  speechConfidence?: number | null;
  engagementLevel?: string;
  frustrationSignals?: string;
  emotionalMood?: string | null;
};

const legacySessionSummaryMetadata = {
  source: "legacy_progress_record_session_signals",
  type: "legacy_engagement_summary",
  canonical: false,
  status: "recent_activity_only",
} as const;

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({
      ok: true,
      ...legacySessionSummaryMetadata,
      summary: {
        learningConfidence: "Not enough data yet",
        engagementLevel: "Not enough data yet",
        speechConfidence: "Not enough data yet",
        frustrationSignals: "Not enough data yet",
        dominantMood: "unknown",
      },
    });
  }

  const requestedStudentId = new URL(request.url).searchParams.get("studentId")?.trim();
  const activeChildId = requestedStudentId || await resolveParentActiveChildId(parentScope.parentId);
  if (!activeChildId) {
    return NextResponse.json({
      ok: true,
      ...legacySessionSummaryMetadata,
      summary: {
        learningConfidence: "Not enough data yet",
        engagementLevel: "Not enough data yet",
        speechConfidence: "Not enough data yet",
        frustrationSignals: "Not enough data yet",
        dominantMood: "unknown",
      },
    });
  }

  const ownedChild = await prisma.childProfile.findFirst({
    where: { id: activeChildId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!ownedChild) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const records = await prisma.progressRecord.findMany({
    where: {
      childId: activeChildId,
      completed: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { notes: true },
  });

  const signals: SessionSignals[] = [];
  for (const record of records) {
    try {
      const parsed = JSON.parse(String(record.notes ?? "{}")) as { sessionSignals?: SessionSignals };
      if (parsed.sessionSignals) {
        signals.push(parsed.sessionSignals);
      }
    } catch {
      // ignore malformed note payloads
    }
  }

  if (!signals.length) {
    return NextResponse.json({
      ok: true,
      ...legacySessionSummaryMetadata,
      summary: {
        learningConfidence: "Not enough data yet",
        engagementLevel: "Not enough data yet",
        speechConfidence: "Not enough data yet",
        frustrationSignals: "Not enough data yet",
        dominantMood: "unknown",
      },
    });
  }

  const moodCounts: Record<string, number> = {};
  let improving = 0;
  let needsSupport = 0;
  let highEngagement = 0;
  let mediumEngagement = 0;
  let highFrustration = 0;
  let mediumFrustration = 0;
  const speechConfidenceValues: number[] = [];

  for (const signal of signals) {
    if (signal.learningConfidence === "improving" || signal.learningConfidence === "mastering") improving += 1;
    if (signal.learningConfidence === "needs_support") needsSupport += 1;

    if (signal.engagementLevel === "high") highEngagement += 1;
    if (signal.engagementLevel === "medium") mediumEngagement += 1;

    if (signal.frustrationSignals === "high") highFrustration += 1;
    if (signal.frustrationSignals === "medium") mediumFrustration += 1;

    if (typeof signal.speechConfidence === "number") {
      speechConfidenceValues.push(signal.speechConfidence);
    }

    if (signal.emotionalMood) {
      moodCounts[signal.emotionalMood] = (moodCounts[signal.emotionalMood] ?? 0) + 1;
    }
  }

  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const speechAverage = speechConfidenceValues.length
    ? Math.round(speechConfidenceValues.reduce((sum, value) => sum + value, 0) / speechConfidenceValues.length)
    : null;

  return NextResponse.json({
    ok: true,
    ...legacySessionSummaryMetadata,
    summary: {
      learningConfidence: improving >= needsSupport ? "Improving" : "Needs support",
      engagementLevel: highEngagement >= Math.max(1, mediumEngagement) ? "High" : mediumEngagement > 0 ? "Medium" : "Low",
      speechConfidence: speechAverage === null ? "Unknown" : speechAverage >= 75 ? "High" : speechAverage >= 50 ? "Medium" : "Low",
      frustrationSignals: highFrustration > 2 ? "High" : mediumFrustration > 0 ? "Medium" : "Low",
      dominantMood,
    },
  });
}
