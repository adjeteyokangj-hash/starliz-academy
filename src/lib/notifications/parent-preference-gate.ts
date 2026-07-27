import { prisma } from "@/lib/db";

export const PARENT_OPTIONAL_NOTIFICATION_TYPES = {
  emailWeeklyReport: "parent_weekly_report",
  assignmentAlerts: "parent_assignment_alert",
  lessonReminders: "parent_lesson_reminder",
  rewardNotifications: "parent_reward_notification",
  productUpdates: "parent_product_update",
  /** Maps Short Learning booking reminders to lessonReminders preference. */
  shortLearningSessionReminder: "parent_lesson_reminder",
  /** Session completion / progress style notices. */
  shortLearningSessionCompleted: "parent_reward_notification",
} as const;

/** Essential notices parents cannot disable (billing, security, legal). */
export const PARENT_ESSENTIAL_NOTIFICATION_EVENT_TYPES = new Set([
  "parent_subscription_payment_failed",
  "parent_subscription_payment_retry_scheduled",
  "parent_subscription_grace_period_started",
  "parent_subscription_grace_period_ending",
  "parent_subscription_subscription_cancelled",
  "parent_subscription_access_ending",
  "parent_subscription_subscription_expired",
  "parent_subscription_payment_recovered",
  "security_alert",
  "legal_required",
]);

type PreferenceLookup = (input: {
  parentUserId: string;
  preferenceEventType: string;
}) => Promise<{ emailEnabled: boolean } | null>;

async function defaultPreferenceLookup(input: {
  parentUserId: string;
  preferenceEventType: string;
}): Promise<{ emailEnabled: boolean } | null> {
  const row = await prisma.notificationPreference.findFirst({
    where: {
      userId: input.parentUserId,
      eventType: input.preferenceEventType,
      schoolId: null,
      trustId: null,
    },
    select: { emailEnabled: true },
  });
  return row;
}

/**
 * Returns false when an optional preference is explicitly disabled.
 * Missing preference rows fall back to `defaultEnabled` (usually true for service reminders).
 * Essential event types always return true.
 */
export async function parentAllowsOptionalNotification(input: {
  parentUserId: string;
  preferenceEventType: string;
  defaultEnabled?: boolean;
  lookup?: PreferenceLookup;
}): Promise<boolean> {
  if (PARENT_ESSENTIAL_NOTIFICATION_EVENT_TYPES.has(input.preferenceEventType)) {
    return true;
  }

  const lookup = input.lookup ?? defaultPreferenceLookup;
  const row = await lookup({
    parentUserId: input.parentUserId,
    preferenceEventType: input.preferenceEventType,
  });

  if (!row) return input.defaultEnabled ?? true;
  return row.emailEnabled;
}
