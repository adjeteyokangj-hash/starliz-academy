import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { buildBlackBoxGateFailure, hasPassedBlackBoxGate } from "@/lib/ai/content-black-box-gate";

type Context = { params: Promise<{ id: string }> };

type PublishableContentRecord = {
  id: string;
  status: string;
  metadataJson: string | null;
};

type PublishedContentRecord = {
  id: string;
  status: string;
  publishedAt: Date | null;
};

type AdminContentPublishDeps = {
  requireAdmin: typeof requireAdmin;
  findContent: (id: string) => Promise<PublishableContentRecord | null>;
  updateContentToPublished: (id: string) => Promise<PublishedContentRecord>;
};

async function defaultFindContent(id: string): Promise<PublishableContentRecord | null> {
  return prisma.aIContentCache.findUnique({
    where: { id },
    select: { id: true, status: true, metadataJson: true },
  });
}

async function defaultUpdateContentToPublished(id: string): Promise<PublishedContentRecord> {
  return prisma.aIContentCache.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: new Date(),
    },
    select: { id: true, status: true, publishedAt: true },
  });
}

const defaultDeps: AdminContentPublishDeps = {
  requireAdmin,
  findContent: defaultFindContent,
  updateContentToPublished: defaultUpdateContentToPublished,
};

export async function handleAdminContentPublishPost(
  _request: Request,
  context: Context,
  deps: AdminContentPublishDeps = defaultDeps,
) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const { id } = await context.params;

  const content = await deps.findContent(id);

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (!["reviewed", "published"].includes(content.status)) {
    return NextResponse.json(
      { error: `Cannot publish content with status "${content.status}". Status must be "reviewed" or "published".` },
      { status: 422 },
    );
  }

  if (!hasPassedBlackBoxGate(content.metadataJson)) {
    return NextResponse.json(buildBlackBoxGateFailure(), { status: 409 });
  }

  const updated = await deps.updateContentToPublished(id);

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    publishedAt: updated.publishedAt?.toISOString(),
  });
}

export async function POST(request: Request, context: Context) {
  return handleAdminContentPublishPost(request, context);
}