import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { prisma } from "@/lib/db";

const schema = z.object({
  minPasswordLength: z.number().int().min(6).max(32),
  requireUppercase: z.boolean(),
  requireNumber: z.boolean(),
  requireSpecial: z.boolean(),
  sessionTimeoutHours: z.number().int().min(1).max(720),
  maxLoginAttempts: z.number().int().min(3).max(20),
  twoFaEnabled: z.boolean(),
});

type SecuritySettingsRow = {
  id: string;
  minPasswordLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  sessionTimeoutHours: number;
  maxLoginAttempts: number;
  twoFaEnabled: boolean;
};

function getModel() {
  return (prisma as unknown as { securitySettings?: {
    findFirst: () => Promise<SecuritySettingsRow | null>;
    update: (args: { where: { id: string }; data: Omit<SecuritySettingsRow, "id"> }) => Promise<SecuritySettingsRow>;
    create: (args: { data: Omit<SecuritySettingsRow, "id"> }) => Promise<SecuritySettingsRow>;
  } }).securitySettings;
}

const defaults: Omit<SecuritySettingsRow, "id"> = {
  minPasswordLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: false,
  sessionTimeoutHours: 24,
  maxLoginAttempts: 5,
  twoFaEnabled: false,
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
  if (!model) return NextResponse.json({ error: "SecuritySettings table not yet migrated." }, { status: 503 });

  const existing = await model.findFirst();
  const data = { ...parsed.data };

  const settings = existing
    ? await model.update({ where: { id: existing.id }, data })
    : await model.create({ data });

  return NextResponse.json({ settings });
}
