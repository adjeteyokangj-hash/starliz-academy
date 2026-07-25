/**
 * Phase 6 Policy & Knowledge Centre — shared document model.
 * Content only; no CMS / schema. Status values are editorial metadata.
 */

export const POLICY_STATUSES = [
  "Draft",
  "Under Review",
  "Approved",
  "Published",
  "Archived",
] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export type PolicyAudience =
  | "Public"
  | "Parent"
  | "Student"
  | "Tutor"
  | "School Admin"
  | "Platform Admin"
  | "Staff";

export type PolicyCategory =
  | "legal"
  | "product"
  | "operational"
  | "handbook"
  | "runbook"
  | "knowledge";

export type PolicySection = {
  heading: string;
  body: string[];
};

export type PolicyDocument = {
  id: string;
  slug: string;
  title: string;
  version: string;
  status: PolicyStatus;
  effectiveDate: string;
  lastReviewed: string;
  nextReview: string;
  owner: string;
  audience: PolicyAudience[];
  category: PolicyCategory;
  purpose: string;
  scope: string;
  /** Shown on public pages when not formally approved */
  legalReviewRequired: boolean;
  summary: string;
  definitions?: Array<{ term: string; meaning: string }>;
  responsibilities?: Array<{ role: string; duty: string }>;
  sections: PolicySection[];
  exceptions?: string[];
  reportingRoute?: string;
  complaintsRoute?: string;
  relatedDocumentIds?: string[];
  changeHistory: Array<{ version: string; date: string; summary: string }>;
  /** Public href if published on the website */
  publicPath?: string;
  /** Hide from public hub but keep in registry / staff knowledge */
  publicVisible?: boolean;
};

export const PHASE6_META = {
  effectiveDate: "2026-07-25",
  lastReviewed: "2026-07-25",
  nextReview: "2027-01-25",
  owner: "StarLiz Academy Product & Compliance (draft)",
  version: "0.9.0-draft",
} as const;

export function draftBanner(doc: PolicyDocument): string | null {
  if (doc.status === "Published" && !doc.legalReviewRequired) return null;
  if (doc.legalReviewRequired) {
    return "Draft for legal review — this document describes current product behaviour and is not formal legal advice.";
  }
  if (doc.status === "Draft" || doc.status === "Under Review") {
    return `Status: ${doc.status}. Subject to internal review before formal publication.`;
  }
  return null;
}
