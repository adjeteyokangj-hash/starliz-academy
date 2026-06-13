import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { createGaCategory, listGaCategoriesAdmin } from "@/lib/ga-categories";

const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
  usedByWordBank: z.boolean().optional(),
  usedByLessons: z.boolean().optional(),
});

function serialize<T extends { createdAt: Date; updatedAt: Date }>(row: T): T & { createdAt: string; updatedAt: string } {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const items = await listGaCategoriesAdmin();
  return NextResponse.json({ items: items.map(serialize) });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = createSchema.parse(await request.json());
    const item = await createGaCategory(body);
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_category.created",
      entityType: "ga_category",
      entityId: item.id,
      metadata: { name: item.name, slug: item.slug, usedByWordBank: item.usedByWordBank, usedByLessons: item.usedByLessons },
    });
    return NextResponse.json({ item: serialize(item) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Ga category." }, { status: 400 });
  }
}
