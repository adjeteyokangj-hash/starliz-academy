import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { createGaSource, listGaSources } from "@/lib/ga-word-bank";

const sourceSchema = z.object({
  sourceName: z.string().trim().min(1),
  sourceYear: z.number().int().optional().nullable(),
  fileName: z.string().trim().optional().nullable(),
  fileReference: z.string().trim().optional().nullable(),
  pageNumber: z.number().int().optional().nullable(),
  section: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

function serializeSource<T extends { createdAt: Date; updatedAt: Date }>(source: T) {
  return { ...source, createdAt: source.createdAt.toISOString(), updatedAt: source.updatedAt.toISOString() };
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;
  const items = await listGaSources();
  return NextResponse.json({ items: items.map(serializeSource) });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = sourceSchema.parse(await request.json());
    const created = await createGaSource(body);
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_source.created",
      entityType: "ga_source",
      entityId: created.id,
      metadata: { sourceName: created.sourceName, sourceYear: created.sourceYear, pageNumber: created.pageNumber, section: created.section },
    });
    return NextResponse.json({ item: serializeSource(created) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Ga source." }, { status: 400 });
  }
}
