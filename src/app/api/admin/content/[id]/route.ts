import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z
  .object({
    status: z.enum(["generated", "reviewed", "approved", "published", "rejected"]).optional(),
    contentJson: z.string().min(2).optional(),
  })
  .refine((value) => value.status !== undefined || value.contentJson !== undefined, {
    message: "Provide at least one field to update.",
  });

function toItems(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  if (parsed && typeof parsed === "object") {
    return [parsed as Record<string, unknown>];
  }
  return [];
}

function isValidForContentType(contentType: string, parsed: unknown): boolean {
  const items = toItems(parsed);
  if (!items.length) return false;

  if (contentType === "spelling") {
    return items.every((item) => typeof item.word === "string" && item.word.trim().length > 0);
  }

  if (contentType === "math") {
    return items.every((item) => {
      const prompt = typeof item.prompt === "string" ? item.prompt : typeof item.question === "string" ? item.question : "";
      const answer = item.answer;
      return prompt.trim().length > 0 && (typeof answer === "number" || (typeof answer === "string" && answer.trim().length > 0));
    });
  }

  if (contentType === "reading") {
    return items.every((item) =>
      typeof item.passage === "string"
      && item.passage.trim().length > 0
      && typeof item.question === "string"
      && item.question.trim().length > 0
      && typeof item.answer === "string"
      && item.answer.trim().length > 0,
    );
  }

  return true;
}

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("content:approve");
  if (!session) return response;

  const { id } = await context.params;
  const item = await prisma.aIContentCache.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      ...item,
      createdAt: item.createdAt.toISOString(),
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
      approvedAt: item.approvedAt?.toISOString() ?? null,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const { id } = await context.params;
  try {
    const body = patchSchema.parse(await request.json());
    const now = new Date();

    const existing = await prisma.aIContentCache.findUnique({
      where: { id },
      select: { id: true, contentType: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }

    let sanitizedContentJson: string | undefined;
    if (body.contentJson !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.contentJson);
      } catch {
        return NextResponse.json({ error: "contentJson must be valid JSON." }, { status: 400 });
      }

      if (!isValidForContentType(existing.contentType, parsed)) {
        return NextResponse.json({ error: "JSON does not match expected content shape." }, { status: 400 });
      }

      sanitizedContentJson = JSON.stringify(parsed);
    }

    const item = await prisma.aIContentCache.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.status === "reviewed" ? { reviewedAt: now } : {}),
        ...(body.status === "approved" ? { approvedAt: now } : {}),
        ...(body.status === "published" ? { publishedAt: now } : {}),
        ...(sanitizedContentJson !== undefined ? { contentJson: sanitizedContentJson } : {}),
      },
      select: { id: true, status: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: body.status ? `ai_content.${body.status}` : "ai_content.updated",
      entityType: "content",
      entityId: item.id,
      metadata: { status: item.status, contentUpdated: sanitizedContentJson !== undefined },
    });

    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: "Invalid content status update." }, { status: 400 });
  }
}
