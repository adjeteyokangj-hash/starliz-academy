import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { prisma } from "@/lib/db";

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const type = req.nextUrl.searchParams.get("type") ?? "users";
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  let data: Record<string, unknown>[] = [];
  let filename = "export";

  if (type === "users") {
    const rows = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true,
        createdAt: true, updatedAt: true,
        _count: { select: { children: true, subscriptions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    data = rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name ?? "",
      role: r.role,
      children: r._count.children,
      subscriptions: r._count.subscriptions,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    filename = "users";
  } else if (type === "children") {
    const rows = await prisma.childProfile.findMany({
      select: {
        id: true, name: true, age: true, yearGroup: true,
        stars: true, xp: true, coins: true, level: true, streak: true,
        archived: true, createdAt: true, updatedAt: true,
        parent: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    data = rows.map((r) => ({
      id: r.id,
      parentEmail: r.parent.email,
      name: r.name,
      age: r.age ?? "",
      yearGroup: r.yearGroup ?? "",
      stars: r.stars,
      xp: r.xp,
      coins: r.coins,
      level: r.level,
      streak: r.streak,
      archived: r.archived,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    filename = "children";
  } else if (type === "progress") {
    const rows = await prisma.progressRecord.findMany({
      select: {
        id: true, activityType: true, activityName: true,
        starsEarned: true, xpEarned: true, coinsEarned: true,
        score: true, correct: true, difficulty: true,
        accuracy: true, completed: true, createdAt: true,
        child: { select: { name: true, parent: { select: { email: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    data = rows.map((r) => ({
      id: r.id,
      parentEmail: r.child.parent.email,
      childName: r.child.name,
      activityType: r.activityType,
      activityName: r.activityName,
      starsEarned: r.starsEarned,
      xpEarned: r.xpEarned,
      score: r.score ?? "",
      correct: r.correct ?? "",
      difficulty: r.difficulty ?? "",
      accuracy: r.accuracy ?? "",
      completed: r.completed,
      createdAt: r.createdAt.toISOString(),
    }));
    filename = "progress";
  } else if (type === "subscriptions") {
    const rows = await prisma.subscription.findMany({
      select: {
        id: true, planKey: true, status: true, provider: true,
        trialEndsAt: true, currentPeriodEnd: true,
        createdAt: true, updatedAt: true,
        parent: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    data = rows.map((r) => ({
      id: r.id,
      parentEmail: r.parent.email,
      parentName: r.parent.name ?? "",
      planKey: r.planKey,
      status: r.status,
      provider: r.provider,
      trialEndsAt: r.trialEndsAt?.toISOString() ?? "",
      currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? "",
      createdAt: r.createdAt.toISOString(),
    }));
    filename = "subscriptions";
  } else {
    return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
  }

  if (format === "json") {
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}-${new Date().toISOString().slice(0,10)}.json"`,
      },
    });
  }

  const csv = toCSV(data);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
