import { dispatchPendingNotificationEvents } from "@/lib/notifications/dispatcher";

export async function runSchoolNotificationDispatch() {
  const processed = await dispatchPendingNotificationEvents(100);
  return { processed };
}
