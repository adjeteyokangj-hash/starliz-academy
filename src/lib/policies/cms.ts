/**
 * Gate 5 — Policy CMS service (versioning, approval, publication).
 * Drafts are mutable. Approved/published versions are immutable.
 */
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import type { PolicyDocument } from "@/lib/policies/types";

export const POLICY_CMS_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "superseded",
  "archived",
] as const;
export type PolicyCmsStatus = (typeof POLICY_CMS_STATUSES)[number];

type ApprovalEntry = {
  action: string;
  actorUserId: string;
  at: string;
  note?: string;
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function bumpVersion(current: string): string {
  const match = current.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return `${current}.1`;
  return `${match[1]}.${Number(match[2]) + 1}.0`;
}

export function serializePolicyBody(doc: PolicyDocument): string {
  return JSON.stringify(doc);
}

export function deserializePolicyBody(contentJson: string): PolicyDocument {
  return parseJson<PolicyDocument>(contentJson, {
    id: "",
    slug: "",
    title: "",
    version: "0.0.0",
    status: "Draft",
    effectiveDate: "",
    lastReviewed: "",
    nextReview: "",
    owner: "",
    audience: ["Public"],
    category: "legal",
    purpose: "",
    scope: "",
    legalReviewRequired: true,
    summary: "",
    sections: [],
    changeHistory: [],
  });
}

export async function listPolicyDocuments(input?: {
  visibility?: "public" | "internal" | "all";
  status?: string;
  q?: string;
}) {
  const visibility = input?.visibility ?? "all";
  const docs = await prisma.policyDocumentRecord.findMany({
    where: visibility === "all" ? undefined : { visibility },
    orderBy: { title: "asc" },
    include: {
      versions: { orderBy: { updatedAt: "desc" }, take: 8 },
    },
  });

  const q = input?.q?.trim().toLowerCase();
  return docs
    .map((doc) => {
      const current =
        doc.versions.find((v) => v.id === doc.currentVersionId)
        ?? doc.versions.find((v) => v.status === "published")
        ?? doc.versions[0]
        ?? null;
      return { doc, current };
    })
    .filter(({ doc, current }) => {
      if (input?.status && current?.status !== input.status) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q)
        || doc.slug.toLowerCase().includes(q)
        || (current?.changeLog ?? "").toLowerCase().includes(q)
      );
    });
}

export async function getPolicyDocumentBySlug(slug: string) {
  return prisma.policyDocumentRecord.findUnique({
    where: { slug },
    include: { versions: { orderBy: { updatedAt: "desc" } } },
  });
}

export async function getPublishedPublicPolicy(slug: string) {
  const doc = await prisma.policyDocumentRecord.findUnique({
    where: { slug },
    include: {
      versions: {
        where: { status: "published" },
        orderBy: { publishedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!doc || doc.visibility !== "public") return null;
  const version = doc.versions[0];
  if (!version) return null;
  return { doc, version, body: deserializePolicyBody(version.contentJson) };
}

export async function createPolicyDraft(input: {
  actorUserId: string;
  slug: string;
  title: string;
  category: string;
  visibility: "public" | "internal";
  audience: string[];
  body: PolicyDocument;
  changeLog?: string;
}) {
  const existing = await prisma.policyDocumentRecord.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw new Error("A policy with this slug already exists.");
  }

  const versionLabel = input.body.version || "1.0.0-draft";
  const created = await prisma.policyDocumentRecord.create({
    data: {
      slug: input.slug,
      title: input.title,
      category: input.category,
      visibility: input.visibility,
      audienceJson: JSON.stringify(input.audience),
      versions: {
        create: {
          version: versionLabel,
          status: "draft",
          authorId: input.actorUserId,
          contentJson: serializePolicyBody({ ...input.body, slug: input.slug, title: input.title }),
          changeLog: input.changeLog ?? "Initial draft",
          approvalHistoryJson: JSON.stringify([
            { action: "created", actorUserId: input.actorUserId, at: new Date().toISOString() } satisfies ApprovalEntry,
          ]),
          effectiveDate: input.body.effectiveDate ? new Date(input.body.effectiveDate) : null,
        },
      },
    },
    include: { versions: true },
  });

  const version = created.versions[0];
  await prisma.policyDocumentRecord.update({
    where: { id: created.id },
    data: { currentVersionId: version.id },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "policy_created",
    entityType: "PolicyDocument",
    entityId: created.id,
    metadata: { slug: input.slug, version: versionLabel },
  });

  return created;
}

export async function editPolicyDraft(input: {
  actorUserId: string;
  slug: string;
  body: PolicyDocument;
  changeLog?: string;
}) {
  const doc = await getPolicyDocumentBySlug(input.slug);
  if (!doc) throw new Error("Policy not found.");
  const current = doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions[0];
  if (!current) throw new Error("No version found.");

  if (current.status === "draft" || current.status === "in_review") {
    const history = parseJson<ApprovalEntry[]>(current.approvalHistoryJson, []);
    history.push({ action: "edited", actorUserId: input.actorUserId, at: new Date().toISOString() });
    const updated = await prisma.policyVersion.update({
      where: { id: current.id },
      data: {
        contentJson: serializePolicyBody(input.body),
        changeLog: input.changeLog ?? current.changeLog,
        lastUpdatedAt: new Date(),
        approvalHistoryJson: JSON.stringify(history),
        authorId: input.actorUserId,
      },
    });
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "policy_edited",
      entityType: "PolicyVersion",
      entityId: updated.id,
      metadata: { slug: input.slug, version: updated.version, status: updated.status },
    });
    return updated;
  }

  // Published/approved/archived → new draft version
  const nextVersion = bumpVersion(current.version);
  const created = await prisma.policyVersion.create({
    data: {
      documentId: doc.id,
      version: nextVersion,
      status: "draft",
      authorId: input.actorUserId,
      supersedesId: current.id,
      contentJson: serializePolicyBody({ ...input.body, version: nextVersion }),
      changeLog: input.changeLog ?? `Draft branched from ${current.version}`,
      approvalHistoryJson: JSON.stringify([
        { action: "branched", actorUserId: input.actorUserId, at: new Date().toISOString(), note: `from ${current.version}` },
      ]),
      effectiveDate: input.body.effectiveDate ? new Date(input.body.effectiveDate) : current.effectiveDate,
    },
  });
  await prisma.policyDocumentRecord.update({
    where: { id: doc.id },
    data: { currentVersionId: created.id, title: input.body.title },
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "policy_edited",
    entityType: "PolicyVersion",
    entityId: created.id,
    metadata: { slug: input.slug, version: nextVersion, branchedFrom: current.version },
  });
  return created;
}

export async function submitPolicyForReview(input: { actorUserId: string; slug: string; note?: string }) {
  const doc = await getPolicyDocumentBySlug(input.slug);
  if (!doc) throw new Error("Policy not found.");
  const current = doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions[0];
  if (!current || (current.status !== "draft" && current.status !== "in_review")) {
    throw new Error("Only drafts can be submitted for review.");
  }
  const history = parseJson<ApprovalEntry[]>(current.approvalHistoryJson, []);
  history.push({ action: "submitted", actorUserId: input.actorUserId, at: new Date().toISOString(), note: input.note });
  const updated = await prisma.policyVersion.update({
    where: { id: current.id },
    data: { status: "in_review", approvalHistoryJson: JSON.stringify(history), lastUpdatedAt: new Date() },
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "policy_submitted_for_review",
    entityType: "PolicyVersion",
    entityId: updated.id,
    metadata: { slug: input.slug, version: updated.version },
  });
  return updated;
}

export async function approvePolicy(input: { actorUserId: string; slug: string; note?: string }) {
  const doc = await getPolicyDocumentBySlug(input.slug);
  if (!doc) throw new Error("Policy not found.");
  const current = doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions[0];
  if (!current || current.status !== "in_review") {
    throw new Error("Only in-review policies can be approved.");
  }
  const history = parseJson<ApprovalEntry[]>(current.approvalHistoryJson, []);
  history.push({ action: "approved", actorUserId: input.actorUserId, at: new Date().toISOString(), note: input.note });
  const updated = await prisma.policyVersion.update({
    where: { id: current.id },
    data: {
      status: "approved",
      approvedBy: input.actorUserId,
      approvedAt: new Date(),
      approvalHistoryJson: JSON.stringify(history),
      lastUpdatedAt: new Date(),
    },
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "policy_approved",
    entityType: "PolicyVersion",
    entityId: updated.id,
    metadata: { slug: input.slug, version: updated.version },
  });
  return updated;
}

export async function publishPolicy(input: { actorUserId: string; slug: string; note?: string }) {
  const doc = await getPolicyDocumentBySlug(input.slug);
  if (!doc) throw new Error("Policy not found.");
  const current = doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions[0];
  if (!current) throw new Error("No version found.");

  if (current.status === "published") {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "policy_published",
      entityType: "PolicyVersion",
      entityId: current.id,
      metadata: { slug: input.slug, version: current.version, idempotent: true },
    });
    return { version: current, idempotent: true as const };
  }

  if (current.status !== "approved") {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "policy_publish_rejected",
      entityType: "PolicyVersion",
      entityId: current.id,
      metadata: { slug: input.slug, version: current.version, reason: "not_approved", status: current.status },
    });
    throw new Error("Publication requires an approved version.");
  }

  const previousPublished = doc.versions.filter((v) => v.status === "published" && v.id !== current.id);
  for (const prev of previousPublished) {
    await prisma.policyVersion.update({
      where: { id: prev.id },
      data: { status: "superseded", archivedAt: new Date() },
    });
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "policy_superseded",
      entityType: "PolicyVersion",
      entityId: prev.id,
      metadata: { slug: input.slug, version: prev.version, supersededBy: current.version },
    });
  }

  const history = parseJson<ApprovalEntry[]>(current.approvalHistoryJson, []);
  history.push({ action: "published", actorUserId: input.actorUserId, at: new Date().toISOString(), note: input.note });
  const updated = await prisma.policyVersion.update({
    where: { id: current.id },
    data: {
      status: "published",
      publishedAt: new Date(),
      effectiveDate: current.effectiveDate ?? new Date(),
      approvalHistoryJson: JSON.stringify(history),
      lastUpdatedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "policy_published",
    entityType: "PolicyVersion",
    entityId: updated.id,
    metadata: { slug: input.slug, version: updated.version, visibility: doc.visibility },
  });

  return { version: updated, idempotent: false as const };
}

export async function archivePolicy(input: { actorUserId: string; slug: string; note?: string }) {
  const doc = await getPolicyDocumentBySlug(input.slug);
  if (!doc) throw new Error("Policy not found.");
  const current = doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions[0];
  if (!current) throw new Error("No version found.");
  const history = parseJson<ApprovalEntry[]>(current.approvalHistoryJson, []);
  history.push({ action: "archived", actorUserId: input.actorUserId, at: new Date().toISOString(), note: input.note });
  const updated = await prisma.policyVersion.update({
    where: { id: current.id },
    data: {
      status: "archived",
      archivedAt: new Date(),
      approvalHistoryJson: JSON.stringify(history),
      lastUpdatedAt: new Date(),
    },
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "policy_archived",
    entityType: "PolicyVersion",
    entityId: updated.id,
    metadata: { slug: input.slug, version: updated.version },
  });
  return updated;
}

export async function setPolicyVisibility(input: {
  actorUserId: string;
  slug: string;
  visibility: "public" | "internal";
}) {
  const doc = await prisma.policyDocumentRecord.update({
    where: { slug: input.slug },
    data: { visibility: input.visibility },
  });
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "policy_visibility_changed",
    entityType: "PolicyDocument",
    entityId: doc.id,
    metadata: { slug: input.slug, visibility: input.visibility },
  });
  return doc;
}
