import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email-provider";
import { buildWeeklyProgressEmail } from "@/lib/emails/weekly-progress";

export const runtime = "nodejs";

function hasCronAccess(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  const parents = await prisma.user.findMany({
    where: { role: "parent" },
    include: { children: { where: { archived: false }, select: { id: true, name: true } } },
  });

  const results = await Promise.all(
    parents.flatMap((parent) =>
      parent.children.map(async (child) => {
        const attempts = await prisma.attempt.findMany({
          where: {
            studentId: child.id,
            createdAt: { gte: weekAgo },
          },
          orderBy: { createdAt: "desc" },
          select: { subject: true, skillFocus: true, correct: true },
        });

        if (!attempts.length) {
          return { parentEmail: parent.email, childId: child.id, skipped: true as const, reason: "NO_ACTIVITY" };
        }

        const totalAttempts = attempts.length;
        const correctAttempts = attempts.filter((attempt) => attempt.correct).length;
        const accuracy = Math.round((correctAttempts / totalAttempts) * 100);
        const subjectCounts = new Map<string, number>();
        const weakCounts = new Map<string, number>();

        for (const attempt of attempts) {
          subjectCounts.set(attempt.subject, (subjectCounts.get(attempt.subject) ?? 0) + 1);
          if (!attempt.correct) {
            weakCounts.set(attempt.skillFocus, (weakCounts.get(attempt.skillFocus) ?? 0) + 1);
          }
        }

        const improvements = Array.from(subjectCounts.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 3)
          .map(([subject]) => `${subject[0].toUpperCase()}${subject.slice(1)} practice`);

        const focusAreas = Array.from(weakCounts.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 3)
          .map(([skill]) => skill);

        const email = buildWeeklyProgressEmail({
          parentName: parent.name,
          childName: child.name,
          improvements: improvements.length ? improvements : ["Daily learning consistency"],
          totalAttempts,
          accuracy,
          focusAreas,
        });

        const sent = await sendEmail({
          to: parent.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });

        return {
          parentEmail: parent.email,
          childId: child.id,
          skipped: false as const,
          sent,
        };
      }),
    ),
  );

  const sentCount = results.filter((item) => !item.skipped && item.sent.ok).length;
  const skippedCount = results.filter((item) => item.skipped).length;
  const failed = results.filter((item) => !item.skipped && !item.sent.ok);

  return NextResponse.json({
    ok: failed.length === 0,
    sent: sentCount,
    skipped: skippedCount,
    failed,
  });
}