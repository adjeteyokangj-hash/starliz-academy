import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { sendConfiguredOpsWatchHeartbeat } from "@/lib/opswatch/integration";

export async function POST() {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  try {
    // Allow test even when disabled so Connect wizard verification works before enabling.
    const result = await sendConfiguredOpsWatchHeartbeat({ requireEnabled: false });
    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      statusCode: result.responseCode,
      checkedAt: new Date().toISOString(),
    }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error("OpsWatch test error:", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "OpsWatch test failed.",
        statusCode: null,
        checkedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
