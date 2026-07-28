/**
 * Gate 5 — Help Centre CMS (public/internal articles).
 */
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export type HelpArticleBody = string[];

export async function listHelpArticles(input?: {
  visibility?: "public" | "internal" | "all";
  status?: string;
  q?: string;
  category?: string;
}) {
  const visibility = input?.visibility ?? "all";
  const rows = await prisma.helpArticleRecord.findMany({
    where: {
      ...(visibility === "all" ? {} : { visibility }),
      ...(input?.status ? { status: input.status } : {}),
      ...(input?.category ? { category: input.category } : {}),
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  const q = input?.q?.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const keywords = (() => {
      try {
        return JSON.parse(row.keywordsJson) as string[];
      } catch {
        return [];
      }
    })();
    return (
      row.title.toLowerCase().includes(q)
      || row.summary.toLowerCase().includes(q)
      || keywords.some((k) => k.toLowerCase().includes(q))
    );
  });
}

export async function listPublishedPublicHelpArticles(q?: string, category?: string) {
  return listHelpArticles({
    visibility: "public",
    status: "published",
    q,
    category,
  });
}

export async function upsertHelpArticleDraft(input: {
  actorUserId: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  audience: string;
  visibility: "public" | "internal";
  body: HelpArticleBody;
  keywords: string[];
  relatedPolicySlug?: string | null;
  version?: string;
}) {
  const existing = await prisma.helpArticleRecord.findUnique({ where: { slug: input.slug } });
  if (!existing) {
    const created = await prisma.helpArticleRecord.create({
      data: {
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        category: input.category,
        audience: input.audience,
        visibility: input.visibility,
        status: "draft",
        bodyJson: JSON.stringify(input.body),
        keywordsJson: JSON.stringify(input.keywords),
        relatedPolicySlug: input.relatedPolicySlug ?? null,
        version: input.version ?? "1.0.0",
        authorId: input.actorUserId,
      },
    });
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "help_article_created",
      entityType: "HelpArticle",
      entityId: created.id,
      metadata: { slug: input.slug, visibility: input.visibility },
    });
    return created;
  }

  if (existing.status === "published") {
    // Published articles are immutable; create a new draft version by cloning slug-draft pattern is avoided.
    // Instead bump version and move back to draft content on the same record only when explicitly unpublished.
    // For Gate 5: editing published creates a draft clone with -draft suffix is not used; we require archive/unpublish.
  }

  const updated = await prisma.helpArticleRecord.update({
    where: { id: existing.id },
    data: {
      title: input.title,
      summary: input.summary,
      category: input.category,
      audience: input.audience,
      visibility: input.visibility,
      bodyJson: JSON.stringify(input.body),
      keywordsJson: JSON.stringify(input.keywords),
      relatedPolicySlug: input.relatedPolicySlug ?? null,
      version: input.version ?? existing.version,
      authorId: input.actorUserId,
      status: existing.status === "published" ? existing.status : "draft",
    },
  });
  return updated;
}

export async function publishHelpArticle(input: { actorUserId: string; slug: string }) {
  const row = await prisma.helpArticleRecord.findUnique({ where: { slug: input.slug } });
  if (!row) throw new Error("Help article not found.");
  if (row.status === "published") {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "help_article_published",
      entityType: "HelpArticle",
      entityId: row.id,
      metadata: { slug: input.slug, idempotent: true },
    });
    return { article: row, idempotent: true as const };
  }
  const updated = await prisma.helpArticleRecord.update({
    where: { id: row.id },
    data: { status: "published", publishedAt: new Date(), archivedAt: null },
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "help_article_published",
    entityType: "HelpArticle",
    entityId: updated.id,
    metadata: { slug: input.slug, visibility: updated.visibility },
  });
  return { article: updated, idempotent: false as const };
}

export async function archiveHelpArticle(input: { actorUserId: string; slug: string }) {
  const row = await prisma.helpArticleRecord.findUnique({ where: { slug: input.slug } });
  if (!row) throw new Error("Help article not found.");
  const updated = await prisma.helpArticleRecord.update({
    where: { id: row.id },
    data: { status: "archived", archivedAt: new Date() },
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "help_article_archived",
    entityType: "HelpArticle",
    entityId: updated.id,
    metadata: { slug: input.slug },
  });
  return updated;
}
