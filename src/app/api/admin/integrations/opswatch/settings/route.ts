import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { getOpsWatchSettings, saveOpsWatchSettings } from "@/lib/opswatch/integration";
import { opsWatchSettingsSchema } from "@/types/opswatch";

export async function GET() {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  try {
    const settings = await getOpsWatchSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("OpsWatch settings GET error:", error);
    return NextResponse.json({ ok: false, error: "Unable to load OpsWatch settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  try {
    const parsed = opsWatchSettingsSchema.parse(await request.json());
    const row = await saveOpsWatchSettings(parsed, session.userId);
    return NextResponse.json({
      ok: true,
      settings: {
        id: row.id,
        enabled: row.enabled,
        baseUrl: row.baseUrl,
        projectSlug: row.projectSlug,
        environment: row.environment,
      },
    });
  } catch (error) {
    console.error("OpsWatch settings POST error:", error);
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }
}
