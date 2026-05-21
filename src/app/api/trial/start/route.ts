import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { trialSelect } from "@/lib/trial-api";
import {
  createTrialSessionToken,
  getTrialExpiryDate,
  hashTrialSessionToken,
  isTrialExpired,
  normalizeTrialEmail,
  parseSubjectUsage,
  serializeSubjectUsage,
  toSubjectSummary,
  TRIAL_COOKIE_NAME,
} from "@/lib/trial-server";
import { sendTrialUpgradeEmailIfEligible, sendTrialWelcomeEmailIfEligible } from "@/lib/trial-emails";

const startSchema = z.object({
  email: z.string().email(),
  emailConsent: z.literal(true),
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
    const parsed = startSchema.parse(await request.json());
    const email = normalizeTrialEmail(parsed.email);

    const [existingUser, existingTrial] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.trialAccount.findUnique({ where: { email }, select: trialSelect }),
    ]);

    if (existingUser) {
      return NextResponse.json(
        {
          status: "account_exists",
          message: "This email already has a full StarLiz account.",
          signupUrl: `/signup?email=${encodeURIComponent(email)}`,
        },
        { status: 200 },
      );
    }

    const token = createTrialSessionToken();
    const tokenHash = hashTrialSessionToken(token);
    const now = new Date();

    if (!existingTrial) {
      const created = await prisma.trialAccount.create({
        data: {
          email,
          emailConsent: true,
          activitiesRemaining: 10,
          spellingRemaining: 4,
          readingRemaining: 3,
          mathsRemaining: 3,
          trialStartedAt: now,
          trialExpiresAt: getTrialExpiryDate(now),
          lastActiveAt: now,
          subjectUsageJson: serializeSubjectUsage({ spelling: 0, reading: 0, maths: 0 }),
          subjectsUsed: "",
          sessionTokenHash: tokenHash,
          sessionIssuedAt: now,
        },
        select: trialSelect,
      });

      await sendTrialWelcomeEmailIfEligible(created.id).catch(() => undefined);

      const response = NextResponse.json({ status: "new", trial: toTrialPayload(created) }, { status: 201 });
      response.cookies.set(TRIAL_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }

    const expired = isTrialExpired(existingTrial, now) || existingTrial.convertedToAccount;
    if (expired) {
      await sendTrialUpgradeEmailIfEligible(existingTrial.id).catch(() => undefined);
      return NextResponse.json(
        {
          status: "expired",
          message: "Your free trial has ended.",
          signupUrl: `/signup?email=${encodeURIComponent(email)}`,
          trial: toTrialPayload(existingTrial),
        },
        { status: 200 },
      );
    }
    const usage = parseSubjectUsage(existingTrial.subjectUsageJson);
    const updated = await prisma.trialAccount.update({
      where: { id: existingTrial.id },
      data: {
        emailConsent: true,
        lastActiveAt: now,
        subjectsUsed: toSubjectSummary(usage),
        sessionTokenHash: tokenHash,
        sessionIssuedAt: now,
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
    return NextResponse.json({ error: "Invalid trial request." }, { status: 400 });
  }
}
