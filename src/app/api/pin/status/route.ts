import { requireSession } from "@/lib/api_guard";
import { handlePinStatusForSession } from "@/lib/pin-status-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  return handlePinStatusForSession({ sessionUserId: session.userId });
}
