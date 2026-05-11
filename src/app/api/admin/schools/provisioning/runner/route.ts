import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { processQueuedProvisioningJobs } from "@/lib/schools/provisioning";

const runnerSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_SETTINGS");
  if (!session) return response;

  const body = await request.json().catch(() => ({}));
  const parsed = runnerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const processed = await processQueuedProvisioningJobs(parsed.data.limit ?? 10);
  return NextResponse.json({ processed });
}
