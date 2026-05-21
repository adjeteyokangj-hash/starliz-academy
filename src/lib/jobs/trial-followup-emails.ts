import { processScheduledTrialEmails } from "@/lib/trial-emails";

export async function runTrialFollowupEmails() {
  const result = await processScheduledTrialEmails(200);
  return result;
}
