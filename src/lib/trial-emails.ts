import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email-provider";
import { isTrialExpired, parseSubjectUsage } from "@/lib/trial-server";

type TrialEmailType = "welcome" | "continue" | "progress" | "upgrade";

type TrialEmailSnapshot = {
  id: string;
  email: string;
  emailConsent: boolean;
  activitiesRemaining: number;
  trialExpiresAt: Date;
  lastActiveAt: Date;
  activitiesCompleted: number;
  wordsMastered: number;
  subjectUsageJson: string | null;
  convertedToAccount: boolean;
  welcomeEmailSentAt: Date | null;
  continueEmailSentAt: Date | null;
  progressEmailSentAt: Date | null;
  upgradeEmailSentAt: Date | null;
  lastEmailSentAt: Date | null;
};

const EMAIL_COOLDOWN_MS = 1000 * 60 * 60 * 20;
const CONTINUE_INACTIVITY_MS = 1000 * 60 * 60 * 24;

function appOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

function shouldThrottle(lastSentAt: Date | null, now: Date): boolean {
  if (!lastSentAt) return false;
  return now.getTime() - lastSentAt.getTime() < EMAIL_COOLDOWN_MS;
}

function subjectSummary(subjectUsageJson: string | null): string {
  const usage = parseSubjectUsage(subjectUsageJson);
  const items = [
    usage.spelling > 0 ? "spelling" : null,
    usage.reading > 0 ? "reading" : null,
    usage.maths > 0 ? "maths" : null,
  ].filter(Boolean) as string[];

  if (items.length === 0) return "learning activities";
  if (items.length === 1) return `${items[0]} activities`;
  if (items.length === 2) return `${items[0]} and ${items[1]} activities`;
  return `${items[0]}, ${items[1]} and ${items[2]} activities`;
}

function trialToSignupLink(email: string): string {
  return `${appOrigin()}/signup?email=${encodeURIComponent(email)}`;
}

async function markSent(trialId: string, type: TrialEmailType, when: Date): Promise<void> {
  await prisma.trialAccount.update({
    where: { id: trialId },
    data:
      type === "welcome"
        ? { welcomeEmailSentAt: when, lastEmailSentAt: when }
        : type === "continue"
          ? { continueEmailSentAt: when, lastEmailSentAt: when }
          : type === "progress"
            ? { progressEmailSentAt: when, lastEmailSentAt: when }
            : { upgradeEmailSentAt: when, lastEmailSentAt: when },
  });
}

async function sendTrialEmail(snapshot: TrialEmailSnapshot, type: TrialEmailType): Promise<boolean> {
  if (!snapshot.emailConsent) return false;
  const now = new Date();
  if (shouldThrottle(snapshot.lastEmailSentAt, now)) return false;

  const signup = trialToSignupLink(snapshot.email);
  const dashboard = `${appOrigin()}/trial/dashboard`;

  let subject = "";
  let html = "";
  let text = "";

  if (type === "welcome") {
    subject = "Your free StarLiz Academy trial is ready";
    html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a"><h2>Your free StarLiz trial is ready</h2><p>You now have <strong>${snapshot.activitiesRemaining} activities</strong> to explore spelling, reading and maths.</p><p><a href="${dashboard}">Open your trial dashboard</a></p></div>`;
    text = `Your free StarLiz trial is ready. You now have ${snapshot.activitiesRemaining} activities. Open: ${dashboard}`;
  } else if (type === "continue") {
    subject = "You still have learning activities remaining";
    html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a"><h2>Continue your free trial</h2><p>You still have <strong>${snapshot.activitiesRemaining} activities remaining</strong>.</p><p><a href="${dashboard}">Continue Trial</a></p></div>`;
    text = `You still have ${snapshot.activitiesRemaining} activities remaining. Continue trial: ${dashboard}`;
  } else if (type === "progress") {
    const summary = subjectSummary(snapshot.subjectUsageJson);
    subject = "Progress reminder from your StarLiz trial";
    html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a"><h2>Your child made progress today</h2><p>Your child explored ${summary} in trial mode.</p><p>Activities completed: <strong>${snapshot.activitiesCompleted}</strong></p><p>Words mastered: <strong>${snapshot.wordsMastered}</strong></p><p><a href="${dashboard}">Continue Trial</a></p></div>`;
    text = `Progress reminder: your child explored ${summary}. Activities completed: ${snapshot.activitiesCompleted}. Continue trial: ${dashboard}`;
  } else {
    subject = "Create your full parent account to keep learning";
    html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a"><h2>Your free trial has ended</h2><p>Create your full parent account to unlock unlimited personalised learning and save progress permanently.</p><p><a href="${signup}">Create Full Account</a></p></div>`;
    text = `Your free trial has ended. Create your full parent account: ${signup}`;
  }

  const result = await sendEmail({ to: snapshot.email, subject, html, text });
  if (!result.ok) return false;

  await markSent(snapshot.id, type, now);
  return true;
}

export async function sendTrialWelcomeEmailIfEligible(trialId: string): Promise<boolean> {
  const snapshot = await prisma.trialAccount.findUnique({
    where: { id: trialId },
    select: {
      id: true,
      email: true,
      emailConsent: true,
      activitiesRemaining: true,
      trialExpiresAt: true,
      lastActiveAt: true,
      activitiesCompleted: true,
      wordsMastered: true,
      subjectUsageJson: true,
      convertedToAccount: true,
      welcomeEmailSentAt: true,
      continueEmailSentAt: true,
      progressEmailSentAt: true,
      upgradeEmailSentAt: true,
      lastEmailSentAt: true,
    },
  });
  if (!snapshot || snapshot.welcomeEmailSentAt || snapshot.convertedToAccount) return false;
  return sendTrialEmail(snapshot, "welcome");
}

export async function sendTrialProgressEmailIfEligible(trialId: string): Promise<boolean> {
  const snapshot = await prisma.trialAccount.findUnique({
    where: { id: trialId },
    select: {
      id: true,
      email: true,
      emailConsent: true,
      activitiesRemaining: true,
      trialExpiresAt: true,
      lastActiveAt: true,
      activitiesCompleted: true,
      wordsMastered: true,
      subjectUsageJson: true,
      convertedToAccount: true,
      welcomeEmailSentAt: true,
      continueEmailSentAt: true,
      progressEmailSentAt: true,
      upgradeEmailSentAt: true,
      lastEmailSentAt: true,
    },
  });

  if (!snapshot || snapshot.convertedToAccount || snapshot.progressEmailSentAt) return false;
  if (snapshot.activitiesCompleted <= 0) return false;
  return sendTrialEmail(snapshot, "progress");
}

export async function sendTrialUpgradeEmailIfEligible(trialId: string): Promise<boolean> {
  const snapshot = await prisma.trialAccount.findUnique({
    where: { id: trialId },
    select: {
      id: true,
      email: true,
      emailConsent: true,
      activitiesRemaining: true,
      trialExpiresAt: true,
      lastActiveAt: true,
      activitiesCompleted: true,
      wordsMastered: true,
      subjectUsageJson: true,
      convertedToAccount: true,
      welcomeEmailSentAt: true,
      continueEmailSentAt: true,
      progressEmailSentAt: true,
      upgradeEmailSentAt: true,
      lastEmailSentAt: true,
    },
  });

  if (!snapshot || snapshot.upgradeEmailSentAt || snapshot.convertedToAccount) return false;
  if (!isTrialExpired(snapshot)) return false;
  return sendTrialEmail(snapshot, "upgrade");
}

export async function processScheduledTrialEmails(limit = 100): Promise<{ continueSent: number; upgradeSent: number; scanned: number }> {
  const now = new Date();
  const trials = await prisma.trialAccount.findMany({
    where: {
      emailConsent: true,
      convertedToAccount: false,
    },
    orderBy: { lastActiveAt: "asc" },
    take: limit,
    select: {
      id: true,
      email: true,
      emailConsent: true,
      activitiesRemaining: true,
      trialExpiresAt: true,
      lastActiveAt: true,
      activitiesCompleted: true,
      wordsMastered: true,
      subjectUsageJson: true,
      convertedToAccount: true,
      welcomeEmailSentAt: true,
      continueEmailSentAt: true,
      progressEmailSentAt: true,
      upgradeEmailSentAt: true,
      lastEmailSentAt: true,
    },
  });

  let continueSent = 0;
  let upgradeSent = 0;

  for (const trial of trials) {
    if (isTrialExpired(trial)) {
      if (trial.upgradeEmailSentAt) {
        continue;
      }
      const sent = await sendTrialEmail(trial, "upgrade");
      if (sent) upgradeSent += 1;
      continue;
    }

    const inactiveLongEnough = now.getTime() - trial.lastActiveAt.getTime() >= CONTINUE_INACTIVITY_MS;
    if (!trial.continueEmailSentAt && inactiveLongEnough && trial.activitiesRemaining > 0) {
      const sent = await sendTrialEmail(trial, "continue");
      if (sent) continueSent += 1;
    }
  }

  return { continueSent, upgradeSent, scanned: trials.length };
}
