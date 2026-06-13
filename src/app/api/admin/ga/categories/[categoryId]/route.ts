import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { updateGaCategory } from "@/lib/ga-categories";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  usedByWordBank: z.boolean().optional(),
  usedByLessons: z.boolean().optional(),
  force: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

type Context = { params: Promise<{ categoryId: string }> };

function serialize<T extends { createdAt: Date; updatedAt: Date }>(row: T): T & { createdAt: string; updatedAt: string } {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { categoryId } = await context.params;
  try {
    const body = updateSchema.parse(await request.json());
    const item = await updateGaCategory(categoryId, body);
    if (!item) return NextResponse.json({ error: "Ga category not found." }, { status: 404 });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_category.updated",
      entityType: "ga_category",
      entityId: item.id,
      metadata: {
        name: item.name,
        isActive: item.isActive,
        isArchived: item.isArchived,
        usedByWordBank: item.usedByWordBank,
        usedByLessons: item.usedByLessons,
      },
    });

    return NextResponse.json({ item: serialize(item) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Ga category." }, { status: 400 });
  }
}
