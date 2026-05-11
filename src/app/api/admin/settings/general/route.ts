import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { prisma } from "@/lib/db";

const TIMEZONES = [
  "Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid","Europe/Rome",
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Toronto","America/Vancouver","America/Sao_Paulo",
  "Africa/Lagos","Africa/Accra","Africa/Nairobi","Africa/Johannesburg",
  "Asia/Dubai","Asia/Kolkata","Asia/Singapore","Asia/Tokyo","Asia/Shanghai",
  "Australia/Sydney","Pacific/Auckland","UTC",
];

const LOCALES = ["en-GB","en-US","en-AU","en-CA","fr-FR","de-DE","es-ES","pt-BR","ar-SA","zh-CN"];

const schema = z.object({
  appName: z.string().trim().min(1).max(80),
  timezone: z.string().refine((v) => TIMEZONES.includes(v), "Unknown timezone"),
  locale: z.string().refine((v) => LOCALES.includes(v), "Unknown locale"),
  supportEmail: z.string().trim().max(200).email().or(z.literal("")),
  maintenanceMode: z.boolean(),
});

type GeneralSettingsRow = {
  id: string;
  appName: string;
  timezone: string;
  locale: string;
  supportEmail: string;
  maintenanceMode: boolean;
};

function getModel() {
  return (prisma as unknown as { generalSettings?: {
    findFirst: () => Promise<GeneralSettingsRow | null>;
    update: (args: { where: { id: string }; data: Omit<GeneralSettingsRow, "id"> }) => Promise<GeneralSettingsRow>;
    create: (args: { data: Omit<GeneralSettingsRow, "id"> }) => Promise<GeneralSettingsRow>;
  } }).generalSettings;
}

const defaults: Omit<GeneralSettingsRow, "id"> = {
  appName: "StarLiz Academy",
  timezone: "Europe/London",
  locale: "en-GB",
  supportEmail: "",
  maintenanceMode: false,
};

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const model = getModel();
  if (!model) return NextResponse.json({ settings: defaults });

  const row = await model.findFirst();
  return NextResponse.json({ settings: row ?? defaults });
}

export async function PUT(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings payload." }, { status: 400 });
  }

  const model = getModel();
  if (!model) return NextResponse.json({ error: "GeneralSettings table not yet migrated." }, { status: 503 });

  const existing = await model.findFirst();
  const data = {
    appName: parsed.data.appName,
    timezone: parsed.data.timezone,
    locale: parsed.data.locale,
    supportEmail: parsed.data.supportEmail,
    maintenanceMode: parsed.data.maintenanceMode,
  };

  const settings = existing
    ? await model.update({ where: { id: existing.id }, data })
    : await model.create({ data });

  return NextResponse.json({ settings });
}
