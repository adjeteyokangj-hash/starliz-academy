import type { PolicyDocument } from "./types";
import { LEGAL_POLICIES } from "./content/legal-policies";
import { PRODUCT_POLICIES } from "./content/product-policies";
import { STAFF_DOCS } from "./content/staff-docs";

export const ALL_POLICY_DOCUMENTS: PolicyDocument[] = [
  ...LEGAL_POLICIES,
  ...PRODUCT_POLICIES,
  ...STAFF_DOCS,
];

export function getPolicyBySlug(slug: string): PolicyDocument | undefined {
  return ALL_POLICY_DOCUMENTS.find((doc) => doc.slug === slug || doc.id === slug);
}

export function getPolicyByPath(pathname: string): PolicyDocument | undefined {
  const normalised = pathname.replace(/\/$/, "") || "/";
  return ALL_POLICY_DOCUMENTS.find((doc) => doc.publicPath === normalised);
}

export function listPublicPolicyDocuments(): PolicyDocument[] {
  return ALL_POLICY_DOCUMENTS.filter((doc) => doc.publicVisible !== false);
}

export function listStaffOnlyDocuments(): PolicyDocument[] {
  return ALL_POLICY_DOCUMENTS.filter((doc) => doc.publicVisible === false);
}

/** Href for a policy doc in a given library context. */
export function policyDocumentHref(
  doc: PolicyDocument,
  context: "public" | "admin" | "school-admin" = "public",
): string {
  if (doc.publicVisible !== false) {
    return doc.publicPath ?? `/policies/${doc.slug}`;
  }
  if (context === "school-admin") {
    return `/school-admin/knowledge-library/${doc.slug}`;
  }
  return `/admin/policy-library/${doc.slug}`;
}

export function listDocumentsForAudience(
  audience: PolicyDocument["audience"][number],
): PolicyDocument[] {
  return ALL_POLICY_DOCUMENTS.filter((doc) => doc.audience.includes(audience));
}

export function listLegalReviewRequired(): PolicyDocument[] {
  return ALL_POLICY_DOCUMENTS.filter((doc) => doc.legalReviewRequired);
}

/** Hub cards for /policies — public legal + product policies only (staff handbooks are authenticated-only). */
export const POLICY_HUB_GROUPS: Array<{
  title: string;
  description: string;
  slugs: string[];
}> = [
  {
    title: "Legal policies",
    description: "Consumer-facing legal drafts for UK launch (legal review required).",
    slugs: [
      "terms",
      "privacy",
      "cookies",
      "subscription-terms",
      "booking-cancellation",
      "refund-policy",
      "acceptable-use",
      "accessibility",
      "complaints",
      "intellectual-property",
      "ai-use",
      "online-safety",
      "safeguarding",
      "data-protection",
      "data-retention",
      "account-suspension",
    ],
  },
  {
    title: "Learning and support",
    description: "How Day School, Short Learning, AI tutoring and human support work.",
    slugs: [
      "short-learning-policy",
      "day-school-policy",
      "ai-tutor-policy",
      "human-tutor-support",
      "tutor-availability-shifts",
      "booking-reliability",
      "attendance-policy",
    ],
  },
  {
    title: "Conduct and quality",
    description: "Expectations for parents, students, tutors and content quality.",
    slugs: [
      "parent-responsibilities",
      "student-code",
      "tutor-code",
      "behaviour-policy",
      "assessment-progress",
      "learning-reports",
      "lesson-quality",
      "content-review",
      "ai-safety",
      "human-support-escalation",
      "incident-reporting",
      "quality-assurance",
    ],
  },
];
