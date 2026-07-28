import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  archiveHelpArticle,
  listHelpArticles,
  publishHelpArticle,
  upsertHelpArticleDraft,
} from "@/lib/policies/help-cms";

export async function GET(req: NextRequest) {
  let auth = await requireAdminPermission("VIEW_POLICIES");
  if (!auth.session) auth = await requireAdminPermission("MANAGE_SETTINGS");
  if (!auth.session) return auth.response;

  const { searchParams } = new URL(req.url);
  const articles = await listHelpArticles({
    visibility: (searchParams.get("visibility") as "public" | "internal" | "all" | null) ?? "all",
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
  });
  return NextResponse.json({ articles });
}

const upsertSchema = z.object({
  slug: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(3).max(1000),
  category: z.string().trim().min(2).max(80),
  audience: z.string().trim().min(2).max(40),
  visibility: z.enum(["public", "internal"]).default("public"),
  body: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  relatedPolicySlug: z.string().trim().min(1).max(120).nullable().optional(),
  version: z.string().trim().max(40).optional(),
});

export async function POST(req: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_POLICIES");
  if (!session) return response;
  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid help article payload." }, { status: 400 });
  const article = await upsertHelpArticleDraft({ actorUserId: session.userId, ...parsed.data });
  return NextResponse.json({ article }, { status: 201 });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), slug: z.string().trim().min(2) }),
  z.object({ action: z.literal("archive"), slug: z.string().trim().min(2) }),
]);

export async function PATCH(req: NextRequest) {
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid help action." }, { status: 400 });

  if (parsed.data.action === "publish") {
    const { session, response } = await requireAdminPermission("PUBLISH_POLICIES");
    if (!session) return response;
    try {
      const result = await publishHelpArticle({ actorUserId: session.userId, slug: parsed.data.slug });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Publish failed." }, { status: 400 });
    }
  }

  const { session, response } = await requireAdminPermission("MANAGE_POLICIES");
  if (!session) return response;
  try {
    const article = await archiveHelpArticle({ actorUserId: session.userId, slug: parsed.data.slug });
    return NextResponse.json({ article });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Archive failed." }, { status: 400 });
  }
}
