import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { prisma } from "@/lib/db";

const schema = z.object({
  frustrationThreshold: z.number().int().min(1).max(20),
  lowConfidenceThreshold: z.number().int().min(0).max(100),
  adaptationEnabled: z.boolean(),
  warmupRequired: z.boolean(),
  shortSessionMins: z.number().int().min(1).max(60),
  normalSessionMins: z.number().int().min(1).max(120),
});

type AIAdaptRow = {
  id: string;
  frustrationThreshold: number;
  lowConfidenceThreshold: number;
  adaptationEnabled: boolean;
  warmupRequired: boolean;
  shortSessionMins: number;
  normalSessionMins: number;
};

function getModel() {
  return (prisma as unknown as {
    aIAdaptationSettings?: {
      findFirst: () => Promise<AIAdaptRow | null>;
      update: (args: { where: { id: string }; data: Omit<AIAdaptRow, "id"> }) => Promise<AIAdaptRow>;
      create: (args: { data: Partial<Omit<AIAdaptRow, "id">> }) => Promise<AIAdaptRow>;
    };
  }).aIAdaptationSettings;
}

const defaults: Omit<AIAdaptRow, "id"> = {
  frustrationThreshold: 3,
  lowConfidenceThreshold: 40,
  adaptationEnabled: true,
  warmupRequired: true,
  shortSessionMins: 5,
  normalSessionMins: 15,
};

async function getOrCreate(): Promise<AIAdaptRow> {
  const model = getModel();
  if (!model) return { id: "default", ...defaults };
  const row = await model.findFirst();
  if (row) return row;
  return model.create({ data: {} });
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const settings = await getOrCreate();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const body = await req.json() as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  }

  const model = getModel();
  if (!model) return NextResponse.json({ error: "AIAdaptationSettings table not yet migrated." }, { status: 503 });

  const existing = await model.findFirst();
  const data = parsed.data;

  const updated = existing
    ? await model.update({ where: { id: existing.id }, data })
    : await model.create({ data });

  return NextResponse.json({ settings: updated });
}
