import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { trueNumerisSettingsSchema } from "@/types/truenumeris";
import { getTrueNumerisSettings, saveTrueNumerisSettings } from "@/lib/truenumeris/integration";

const settingsSchema = trueNumerisSettingsSchema.extend({
  region: z.enum(["UK", "GH"]).default("UK"),
});

export async function GET() {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  try {
    const settings = await getTrueNumerisSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("TrueNumeris settings GET error:", error);
    return NextResponse.json({ ok: false, error: "Unable to load TrueNumeris settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  try {
    const parsed = settingsSchema.parse(await request.json());
    const row = await saveTrueNumerisSettings(parsed, session.userId);
    return NextResponse.json({
      ok: true,
      settings: {
        id: row.id,
        enabled: row.enabled,
        region: row.region,
        companyId: row.companyId,
        baseUrl: row.baseUrl,
        autoInvoice: row.autoInvoice,
        autoVat: row.autoVat,
        autoReconciliation: row.autoReconciliation,
        syncFrequencyMinutes: row.syncFrequencyMinutes,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }
}
