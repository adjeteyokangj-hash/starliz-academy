import { NextRequest, NextResponse } from "next/server";
import { listPublishedPublicHelpArticles } from "@/lib/policies/help-cms";

/** Public Help Centre search — published + public visibility only. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || undefined;
  const category = searchParams.get("category")?.trim() || undefined;
  try {
    const articles = await listPublishedPublicHelpArticles(q, category);
    return NextResponse.json({
      articles: articles.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        category: a.category,
        audience: a.audience,
        version: a.version,
        relatedPolicySlug: a.relatedPolicySlug,
        keywords: JSON.parse(a.keywordsJson),
        body: JSON.parse(a.bodyJson),
        publishedAt: a.publishedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("public help search failed:", error);
    // Fail soft for public: empty list, not stack traces.
    return NextResponse.json({ articles: [], available: false });
  }
}
