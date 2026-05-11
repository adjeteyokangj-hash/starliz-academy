import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";

type SessionSignals = {
  learningConfidence?: string;
  speechConfidence?: number | null;
  engagementLevel?: string;
  frustrationSignals?: string;
  emotionalMood?: string | null;
};

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({
      ok: true,
      summary: {
        learningConfidence: "Unknown",
        engagementLevel: "Unknown",
        speechConfidence: "Unknown",
        frustrationSignals: "Unknown",
        dominantMood: "neutral",
      },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { activeChildId: true } });
  if (!user?.activeChildId) {
    return NextResponse.json({
      ok: true,
      summary: {
        learningConfidence: "Unknown",
        engagementLevel: "Unknown",
        speechConfidence: "Unknown",
        frustrationSignals: "Unknown",
        dominantMood: "neutral",
      },
    });
  }

  const records = await prisma.progressRecord.findMany({
    where: {
      childId: user.activeChildId,
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
      summary: {
        learningConfidence: "Unknown",
        engagementLevel: "Unknown",
        speechConfidence: "Unknown",
        frustrationSignals: "Unknown",
        dominantMood: "neutral",
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

  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
  const speechAverage = speechConfidenceValues.length
    ? Math.round(speechConfidenceValues.reduce((sum, value) => sum + value, 0) / speechConfidenceValues.length)
    : null;

  return NextResponse.json({
    ok: true,
    summary: {
      learningConfidence: improving >= needsSupport ? "Improving" : "Needs support",
      engagementLevel: highEngagement >= Math.max(1, mediumEngagement) ? "High" : mediumEngagement > 0 ? "Medium" : "Low",
      speechConfidence: speechAverage === null ? "Unknown" : speechAverage >= 75 ? "High" : speechAverage >= 50 ? "Medium" : "Low",
      frustrationSignals: highFrustration > 2 ? "High" : mediumFrustration > 0 ? "Medium" : "Low",
      dominantMood,
    },
  });
}
