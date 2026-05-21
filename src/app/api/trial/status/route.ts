import { NextResponse } from "next/server";
import { getTrialFromCookie } from "@/lib/trial-api";
import { isTrialExpired, parseSubjectUsage } from "@/lib/trial-server";
import { sendTrialUpgradeEmailIfEligible } from "@/lib/trial-emails";

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
  convertedToAccount: boolean;
}) {
  const expired = isTrialExpired(trial) || trial.convertedToAccount;
  const now = Date.now();
  const rawDaysRemaining = Math.ceil((trial.trialExpiresAt.getTime() - now) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, rawDaysRemaining);

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
    daysRemaining,
    activitiesCompleted: trial.activitiesCompleted,
    wordsMastered: trial.wordsMastered,
    subjectUsage: parseSubjectUsage(trial.subjectUsageJson),
    lastActivity: trial.lastActivity,
    streakCount: trial.streakCount,
    expired,
  };
}

export async function GET() {
  const trial = await getTrialFromCookie();
  if (!trial) {
    return NextResponse.json({ error: "Trial session not found." }, { status: 401 });
  }

  if (isTrialExpired(trial) || trial.convertedToAccount) {
    await sendTrialUpgradeEmailIfEligible(trial.id).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, trial: toTrialPayload(trial) }, { status: 200 });
}
