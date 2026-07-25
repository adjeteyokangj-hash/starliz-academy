import {
  PHASE6_META,
  type PolicyAudience,
  type PolicyCategory,
  type PolicyDocument,
  type PolicySection,
  type PolicyStatus,
} from "./types";

type BuildInput = {
  id: string;
  slug: string;
  title: string;
  category: PolicyCategory;
  audience: PolicyAudience[];
  purpose: string;
  scope: string;
  summary: string;
  sections: PolicySection[];
  definitions?: PolicyDocument["definitions"];
  responsibilities?: PolicyDocument["responsibilities"];
  exceptions?: string[];
  reportingRoute?: string;
  complaintsRoute?: string;
  relatedDocumentIds?: string[];
  legalReviewRequired?: boolean;
  status?: PolicyStatus;
  publicPath?: string;
  publicVisible?: boolean;
  version?: string;
};

/** Builds a Phase 6 draft document with consistent metadata. */
export function buildPolicy(input: BuildInput): PolicyDocument {
  const legalReviewRequired = input.legalReviewRequired ?? input.category === "legal";
  const status: PolicyStatus = input.status ?? (legalReviewRequired ? "Draft" : "Under Review");
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    version: input.version ?? PHASE6_META.version,
    status,
    effectiveDate: PHASE6_META.effectiveDate,
    lastReviewed: PHASE6_META.lastReviewed,
    nextReview: PHASE6_META.nextReview,
    owner: PHASE6_META.owner,
    audience: input.audience,
    category: input.category,
    purpose: input.purpose,
    scope: input.scope,
    legalReviewRequired,
    summary: input.summary,
    definitions: input.definitions,
    responsibilities: input.responsibilities,
    sections: input.sections,
    exceptions: input.exceptions,
    reportingRoute: input.reportingRoute,
    complaintsRoute: input.complaintsRoute,
    relatedDocumentIds: input.relatedDocumentIds,
    changeHistory: [
      {
        version: input.version ?? PHASE6_META.version,
        date: PHASE6_META.effectiveDate,
        summary: "Phase 6 draft aligned to shipped UK launch product behaviour.",
      },
    ],
    publicPath: input.publicPath ?? `/policies/${input.slug}`,
    publicVisible: input.publicVisible ?? true,
  };
}

export function s(heading: string, ...body: string[]): PolicySection {
  return { heading, body };
}
