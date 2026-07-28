/**
 * Resolve public policy: published CMS version first; never expose drafts.
 * Falls back to code registry only when no published CMS version exists
 * (legacy Phase 6 content during transition). Registry drafts show legal banner.
 */
import { getPublishedPublicPolicy, deserializePolicyBody } from "@/lib/policies/cms";
import { getPolicyBySlug } from "@/lib/policies/registry";
import type { PolicyDocument } from "@/lib/policies/types";

export async function resolvePublicPolicy(slug: string): Promise<{
  source: "cms" | "registry";
  doc: PolicyDocument;
  version?: string;
  effectiveDate?: string | null;
  publishedAt?: string | null;
  lastUpdatedAt?: string | null;
} | null> {
  try {
    const published = await getPublishedPublicPolicy(slug);
    if (published) {
      const body = published.body;
      return {
        source: "cms",
        doc: {
          ...body,
          version: published.version.version,
          status: "Published",
          legalReviewRequired: false,
          publicVisible: true,
          effectiveDate:
            published.version.effectiveDate?.toISOString().slice(0, 10)
            ?? body.effectiveDate,
          lastReviewed:
            published.version.lastUpdatedAt.toISOString().slice(0, 10),
        },
        version: published.version.version,
        effectiveDate: published.version.effectiveDate?.toISOString() ?? null,
        publishedAt: published.version.publishedAt?.toISOString() ?? null,
        lastUpdatedAt: published.version.lastUpdatedAt.toISOString(),
      };
    }
  } catch {
    // CMS unavailable — fall through to registry.
  }

  const registry = getPolicyBySlug(slug);
  if (!registry || registry.publicVisible === false) return null;
  return { source: "registry", doc: registry };
}

export { deserializePolicyBody };
