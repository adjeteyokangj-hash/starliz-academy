import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashTrialSessionToken, TRIAL_COOKIE_NAME } from "@/lib/trial-server";

export const trialSelect = {
  id: true,
  email: true,
  emailConsent: true,
  activitiesRemaining: true,
  spellingRemaining: true,
  readingRemaining: true,
  mathsRemaining: true,
  trialStartedAt: true,
  trialExpiresAt: true,
  lastActiveAt: true,
  activitiesCompleted: true,
  wordsMastered: true,
  subjectUsageJson: true,
  subjectsUsed: true,
  lastActivity: true,
  streakCount: true,
  convertedToAccount: true,
  upgradedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getTrialFromCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRIAL_COOKIE_NAME)?.value;
  if (!token) return null;

  return prisma.trialAccount.findFirst({
    where: { sessionTokenHash: hashTrialSessionToken(token) },
    select: trialSelect,
  });
}
