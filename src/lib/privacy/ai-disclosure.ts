export type AiUseDisclosure = {
  summary: string;
  appliesTo: string[];
  safeguards: string[];
  parentControls: string[];
  policyLinks: {
    privacy: string;
    terms: string;
    cookiePolicy: string;
  };
  reviewedAt: string;
  reviewStatus: "draft" | "internal_review" | "legal_review_required";
};

export function getAiUseDisclosureSummary(): AiUseDisclosure {
  return {
    summary:
      "StarLiz uses AI to adapt lesson difficulty, detect weak areas, and generate curriculum-aligned recommendations. AI outputs are educational support and require parent/guardian oversight.",
    appliesTo: [
      "Adaptive lesson sequencing",
      "Weak-area detection",
      "Progress insights and recommendations",
      "Content safety moderation signals",
    ],
    safeguards: [
      "No sale of child data",
      "Role-based access to child records",
      "Audit logging for consent and GDPR-sensitive actions",
      "Parent-initiated export and deletion request workflows",
    ],
    parentControls: [
      "Consent acceptance and withdrawal",
      "Child profile management",
      "Data export requests",
      "Deletion requests and status visibility",
    ],
    policyLinks: {
      privacy: "/privacy",
      terms: "/terms",
      cookiePolicy: "/policies#cookie-policy",
    },
    reviewedAt: "2026-06-01",
    reviewStatus: "legal_review_required",
  };
}
