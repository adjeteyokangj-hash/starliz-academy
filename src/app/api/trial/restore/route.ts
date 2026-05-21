import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { trialSelect } from "@/lib/trial-api";
import {
  createTrialSessionToken,
  hashTrialSessionToken,
  isTrialExpired,
  normalizeTrialEmail,
  parseSubjectUsage,
  TRIAL_COOKIE_NAME,
} from "@/lib/trial-server";
import { sendTrialUpgradeEmailIfEligible } from "@/lib/trial-emails";

const restoreSchema = z.object({
  email: z.string().email(),
});

function toTrialPayload(trial: {
  email: string;
  activitiesRemaining: number;
  spellingRemaining: number;
  readingRemaining: number;
  mathsRemaining: number;
  trialStartedAt: Date;
  trialExpiresAt: Date;
  activitiesCompleted: number;
  wordsMastered: number;
  subjectUsageJson: string | null;
  lastActivity: string | null;
  streakCount: number;
}) {
  return {
    email: trial.email,
    activitiesRemaining: trial.activitiesRemaining,
    subjectRemaining: {
      spelling: trial.spellingRemaining,
      reading: trial.readingRemaining,
      maths: trial.mathsRemaining,
    },
    trialStartedAt: trial.trialStartedAt,
    trialExpiresAt: trial.trialExpiresAt,
    activitiesCompleted: trial.activitiesCompleted,
    wordsMastered: trial.wordsMastered,
    subjectUsage: parseSubjectUsage(trial.subjectUsageJson),
    lastActivity: trial.lastActivity,
    streakCount: trial.streakCount,
  };
}

export async function POST(request: Request) {
  try {
    const parsed = restoreSchema.parse(await request.json());
    const email = normalizeTrialEmail(parsed.email);

    const trial = await prisma.trialAccount.findUnique({ where: { email }, select: trialSelect });
    if (!trial) {
      return NextResponse.json({ error: "Trial not found for this email." }, { status: 404 });
    }

    if (isTrialExpired(trial) || trial.convertedToAccount) {
      await sendTrialUpgradeEmailIfEligible(trial.id).catch(() => undefined);
      return NextResponse.json(
        {
          status: "expired",
          message: "Your free trial has ended.",
          signupUrl: `/signup?email=${encodeURIComponent(email)}`,
          trial: toTrialPayload(trial),
        },
        { status: 200 },
      );
    }

    const token = createTrialSessionToken();
    const updated = await prisma.trialAccount.update({
      where: { id: trial.id },
      data: {
        sessionTokenHash: hashTrialSessionToken(token),
        sessionIssuedAt: new Date(),
        lastActiveAt: new Date(),
      },
      select: trialSelect,
    });

    const response = NextResponse.json(
      {
        status: "restored",
        message: `Welcome back. You have ${updated.activitiesRemaining} activities remaining.`,
        trial: toTrialPayload(updated),
      },
      { status: 200 },
    );

    response.cookies.set(TRIAL_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid restore request." }, { status: 400 });
  }
}
