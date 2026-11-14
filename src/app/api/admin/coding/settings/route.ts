import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { codingAssistanceEnabled } from "@/lib/coding/settings";

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_SETTINGS");
  if (!session) return response;
  return NextResponse.json({ humanAssistanceEnabled: await codingAssistanceEnabled() });
}

export async function PUT(request: Request) {
  const { session, response } = await requireAdminPermission("MANAGE_SETTINGS");
  if (!session) return response;
  const parsed = z.object({ humanAssistanceEnabled: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose whether human assistance is enabled." }, { status: 400 });
  try {
    const settings = await prisma.$transaction(async (tx) => {
      const row = await tx.skillsLabSettings.upsert({
        where: { labId: "coding" },
        create: { labId: "coding", updatedBy: session.userId, ...parsed.data },
        update: { updatedBy: session.userId, ...parsed.data },
      });
      await tx.auditLog.create({ data: {
        actorUserId: session.userId, action: "coding.assistance.updated",
        entityType: "SkillsLabSettings", entityId: "coding", metadataJson: JSON.stringify(parsed.data),
      } });
      return row;
    });
    return NextResponse.json({ humanAssistanceEnabled: settings.humanAssistanceEnabled });
  } catch {
    return NextResponse.json({ error: "Coding settings could not be saved. Verify the Skills Lab settings migration is applied." }, { status: 503 });
  }
}
