import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { encryptSecret, maskSecret } from "@/lib/secrets";

const providers = ["openai", "payment", "email", "voice", "storage"] as const;

const saveKeySchema = z.object({
  provider: z.enum(providers),
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export async function GET() {
  const { session, response } = await requireAdminPermission("settings:api_keys:write");
  if (!session) return response;

  const keys = await prisma.apiKeyConfig.findMany({
    orderBy: { provider: "asc" },
    select: {
      id: true,
      provider: true,
      label: true,
      maskedValue: true,
      status: true,
      lastTestedAt: true,
      updatedBy: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    keys: keys.map((key) => ({
      ...key,
      lastTestedAt: key.lastTestedAt?.toISOString() ?? null,
      updatedAt: key.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = saveKeySchema.parse(await request.json());
    const key = await prisma.apiKeyConfig.upsert({
      where: { provider: body.provider },
      update: {
        label: body.label,
        encryptedValue: encryptSecret(body.value),
        maskedValue: maskSecret(body.value),
        status: "untested",
        updatedBy: session.email,
      },
      create: {
        provider: body.provider,
        label: body.label,
        encryptedValue: encryptSecret(body.value),
        maskedValue: maskSecret(body.value),
        updatedBy: session.email,
      },
      select: { id: true, provider: true, label: true, maskedValue: true, status: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "api_key_saved",
      entityType: "api_key",
      entityId: key.id,
      metadata: { provider: key.provider },
    });

    return NextResponse.json({ key });
  } catch {
    return NextResponse.json({ error: "Invalid API key payload." }, { status: 400 });
  }
}

const patchLabelSchema = z.object({
  provider: z.enum(providers),
  label: z.string().trim().min(1),
});

/** Update just the label (e.g. from address) without touching the stored key. */
export async function PATCH(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = patchLabelSchema.parse(await request.json());
    const existing = await prisma.apiKeyConfig.findUnique({ where: { provider: body.provider } });
    if (!existing) {
      return NextResponse.json({ error: "No key saved yet for this provider." }, { status: 404 });
    }
    const key = await prisma.apiKeyConfig.update({
      where: { provider: body.provider },
      data: { label: body.label, updatedBy: session.email },
      select: { id: true, provider: true, label: true, maskedValue: true, status: true },
    });
    await writeAuditLog({
      actorUserId: session.userId,
      action: "api_key_label_updated",
      entityType: "api_key",
      entityId: key.id,
      metadata: { provider: key.provider, label: body.label },
    });
    return NextResponse.json({ key });
  } catch {
    return NextResponse.json({ error: "Invalid patch payload." }, { status: 400 });
  }
}
