import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  approvePolicy,
  archivePolicy,
  deserializePolicyBody,
  editPolicyDraft,
  getPolicyDocumentBySlug,
  publishPolicy,
  setPolicyVisibility,
  submitPolicyForReview,
} from "@/lib/policies/cms";
import type { PolicyDocument } from "@/lib/policies/types";

async function requireAnyPolicyView() {
  const primary = await requireAdminPermission("VIEW_POLICIES");
  if (primary.session) return primary;
  return requireAdminPermission("MANAGE_SETTINGS");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { session, response } = await requireAnyPolicyView();
  if (!session) return response;

  const { slug } = await params;
  const doc = await getPolicyDocumentBySlug(slug);
  if (!doc) return NextResponse.json({ error: "Policy not found." }, { status: 404 });

  return NextResponse.json({
    document: {
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      category: doc.category,
      visibility: doc.visibility,
      audience: JSON.parse(doc.audienceJson),
      currentVersionId: doc.currentVersionId,
      versions: doc.versions.map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        effectiveDate: v.effectiveDate?.toISOString() ?? null,
        lastUpdatedAt: v.lastUpdatedAt.toISOString(),
        authorId: v.authorId,
        approvedBy: v.approvedBy,
        approvedAt: v.approvedAt?.toISOString() ?? null,
        publishedAt: v.publishedAt?.toISOString() ?? null,
        archivedAt: v.archivedAt?.toISOString() ?? null,
        supersedesId: v.supersedesId,
        changeLog: v.changeLog,
        approvalHistory: JSON.parse(v.approvalHistoryJson),
        requiresAck: v.requiresAck,
        body: deserializePolicyBody(v.contentJson),
      })),
    },
  });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    body: z.record(z.string(), z.unknown()),
    changeLog: z.string().trim().max(2000).optional(),
  }),
  z.object({ action: z.literal("submit"), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("approve"), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("publish"), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("archive"), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("set_visibility"), visibility: z.enum(["public", "internal"]) }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid policy action." }, { status: 400 });
  }

  try {
    switch (parsed.data.action) {
      case "edit": {
        const { session, response } = await requireAdminPermission("MANAGE_POLICIES");
        if (!session) return response;
        const version = await editPolicyDraft({
          actorUserId: session.userId,
          slug,
          body: parsed.data.body as unknown as PolicyDocument,
          changeLog: parsed.data.changeLog,
        });
        return NextResponse.json({ version });
      }
      case "submit": {
        const { session, response } = await requireAdminPermission("MANAGE_POLICIES");
        if (!session) return response;
        const version = await submitPolicyForReview({
          actorUserId: session.userId,
          slug,
          note: parsed.data.note,
        });
        return NextResponse.json({ version });
      }
      case "approve": {
        const { session, response } = await requireAdminPermission("APPROVE_POLICIES");
        if (!session) return response;
        const version = await approvePolicy({
          actorUserId: session.userId,
          slug,
          note: parsed.data.note,
        });
        return NextResponse.json({ version });
      }
      case "publish": {
        const { session, response } = await requireAdminPermission("PUBLISH_POLICIES");
        if (!session) return response;
        const result = await publishPolicy({
          actorUserId: session.userId,
          slug,
          note: parsed.data.note,
        });
        return NextResponse.json(result);
      }
      case "archive": {
        const { session, response } = await requireAdminPermission("MANAGE_POLICIES");
        if (!session) return response;
        const version = await archivePolicy({
          actorUserId: session.userId,
          slug,
          note: parsed.data.note,
        });
        return NextResponse.json({ version });
      }
      case "set_visibility": {
        const { session, response } = await requireAdminPermission("MANAGE_POLICIES");
        if (!session) return response;
        const document = await setPolicyVisibility({
          actorUserId: session.userId,
          slug,
          visibility: parsed.data.visibility,
        });
        return NextResponse.json({ document });
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Policy action failed." },
      { status: 400 },
    );
  }
}
