import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTrialFromCookie, trialSelect } from "@/lib/trial-api";
import {
  isTrialExpired,
  parseSubjectUsage,
  serializeSubjectUsage,
  TrialSubject,
  toSubjectSummary,
} from "@/lib/trial-server";
import { sendTrialProgressEmailIfEligible, sendTrialUpgradeEmailIfEligible } from "@/lib/trial-emails";

const bodySchema = z.object({
  subject: z.enum(["spelling", "reading", "maths"]),
  keyStage: z.enum(["ey", "ks1", "ks2"]).optional(),
  wordsMastered: z.number().int().min(0).max(25).optional(),
});

function remainingForSubject(trial: { spellingRemaining: number; readingRemaining: number; mathsRemaining: number }, subject: TrialSubject) {
  if (subject === "spelling") return trial.spellingRemaining;
  if (subject === "reading") return trial.readingRemaining;
  return trial.mathsRemaining;
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const trial = await getTrialFromCookie();

    if (!trial) {
      return NextResponse.json({ error: "Trial session not found." }, { status: 401 });
    }

    if (isTrialExpired(trial) || trial.convertedToAccount) {
      await sendTrialUpgradeEmailIfEligible(trial.id).catch(() => undefined);
      return NextResponse.json(
        {
          status: "expired",
          message: "Your free trial has ended.",
          signupUrl: `/signup?email=${encodeURIComponent(trial.email)}`,
        },
        { status: 403 },
      );
    }

    if (remainingForSubject(trial, body.subject) <= 0 || trial.activitiesRemaining <= 0) {
      return NextResponse.json({ error: `No ${body.subject} trial activities remaining.` }, { status: 409 });
    }

    const usage = parseSubjectUsage(trial.subjectUsageJson);
    usage[body.subject] += 1;

    const now = new Date();
    const words = body.wordsMastered ?? (body.subject === "spelling" ? 5 : body.subject === "reading" ? 3 : 2);
    const activityLabel = body.keyStage ? `${body.subject}:${body.keyStage}` : body.subject;

    const updated = await prisma.trialAccount.update({
      where: { id: trial.id },
      data: {
        activitiesRemaining: { decrement: 1 },
        spellingRemaining: body.subject === "spelling" ? { decrement: 1 } : undefined,
        readingRemaining: body.subject === "reading" ? { decrement: 1 } : undefined,
        mathsRemaining: body.subject === "maths" ? { decrement: 1 } : undefined,
        activitiesCompleted: { increment: 1 },
        wordsMastered: { increment: words },
        subjectUsageJson: serializeSubjectUsage(usage),
        subjectsUsed: toSubjectSummary(usage),
        lastActivity: activityLabel,
        streakCount: {
          increment:
            trial.lastActiveAt.toDateString() === now.toDateString() ? 0 : 1,
        },
        lastActiveAt: now,
      },
      select: trialSelect,
    });

    const expired = isTrialExpired(updated) || updated.convertedToAccount;
    const shouldPromptUpgrade = expired || updated.activitiesRemaining <= 2;

    await sendTrialProgressEmailIfEligible(updated.id).catch(() => undefined);
    if (expired) {
      await sendTrialUpgradeEmailIfEligible(updated.id).catch(() => undefined);
    }

    return NextResponse.json(
      {
        ok: true,
        message: `${body.subject} activity completed successfully.`,
        trial: {
          activitiesRemaining: updated.activitiesRemaining,
          subjectRemaining: {
            spelling: updated.spellingRemaining,
            reading: updated.readingRemaining,
            maths: updated.mathsRemaining,
          },
          activitiesCompleted: updated.activitiesCompleted,
          wordsMastered: updated.wordsMastered,
          subjectUsage: parseSubjectUsage(updated.subjectUsageJson),
          lastActivity: updated.lastActivity,
          streakCount: updated.streakCount,
          expired,
        },
        upgrade: {
          shouldPrompt: shouldPromptUpgrade,
          reason: expired ? "trial_expired" : updated.activitiesRemaining <= 2 ? "activities_low" : "none",
          signupUrl: `/signup?email=${encodeURIComponent(updated.email)}`,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Invalid activity request." }, { status: 400 });
  }
}
