import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAdminDocumentGenerationHealthGet,
  type AdminDocumentGenerationHealthPayload,
} from "../src/app/api/admin/reports/generation-health/route";
import type { DocumentGenerationHealthCounts } from "../src/lib/reports/document-generation-orchestration";

test("document generation health route requires admin reports permission", async () => {
  const response = await handleAdminDocumentGenerationHealthGet(
    new Request("http://localhost/api/admin/reports/generation-health"),
    {
      requireAdminPermission: async () => ({
        session: null,
        response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
      }),
      collectCounts: async () => ({
        activeStudents: 0,
        issuedCertificates: 0,
        recentReportsGenerated: 0,
        pendingDraftReviews: 0,
        blockedByLifecycle: 0,
      }),
    },
  );

  assert.equal(response?.status, 403);
});

test("document generation health route returns safe draft-only informational state", async () => {
  const counts: DocumentGenerationHealthCounts = {
    activeStudents: 0,
    issuedCertificates: 0,
    recentReportsGenerated: 0,
    pendingDraftReviews: 0,
    blockedByLifecycle: 0,
  };

  const response = await handleAdminDocumentGenerationHealthGet(
    new Request("http://localhost/api/admin/reports/generation-health"),
    {
      requireAdminPermission: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
    },
  );

  const payload = await response.json() as AdminDocumentGenerationHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "informational");
  assert.equal(payload.boundary, "draft_only");
  assert.equal(payload.score, 100);
  assert.equal(payload.warnings.length, 0);
});

test("document generation health route warns when backlog is high", async () => {
  const counts: DocumentGenerationHealthCounts = {
    activeStudents: 12,
    issuedCertificates: 8,
    recentReportsGenerated: 10,
    pendingDraftReviews: 8,
    blockedByLifecycle: 1,
  };

  const response = await handleAdminDocumentGenerationHealthGet(
    new Request("http://localhost/api/admin/reports/generation-health"),
    {
      requireAdminPermission: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      collectCounts: async () => counts,
    },
  );

  const payload = await response.json() as AdminDocumentGenerationHealthPayload;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "warning");
  assert.ok(payload.warnings.includes("draft_review_backlog_high"));
  assert.ok(payload.warnings.includes("lifecycle_blocked_drafts_present"));
  assert.equal(payload.boundary, "draft_only");
});
