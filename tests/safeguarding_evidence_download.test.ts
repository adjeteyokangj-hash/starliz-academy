import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import {
  handleSafeguardingEvidenceDownload,
} from "../src/app/api/school/safeguarding/[schoolId]/incidents/[incidentId]/attachments/[attachmentId]/download/route";
import {
  buildSafeguardingEvidenceDownloadUrl,
  toSafeguardingEvidenceAttachmentView,
} from "../src/lib/schools/safeguarding-evidence";

const params = {
  schoolId: "school-1",
  incidentId: "incident-1",
  attachmentId: "attachment-1",
};

function context(overrides: Partial<typeof params> = {}) {
  return { params: Promise.resolve({ ...params, ...overrides }) };
}

function okRoleDeps(overrides: {
  attachment?: {
    id: string;
    schoolId: string;
    incidentId: string;
    storedFilename: string;
    originalName: string;
    mimeType: string | null;
    fileSizeBytes: number | null;
  } | null;
  body?: string;
} = {}) {
  let downloadedObjectKey: string | null = null;
  const body = new TextEncoder().encode(overrides.body ?? "evidence-bytes");
  return {
    deps: {
      requireSchoolRoles: async (...args: unknown[]) => {
        assert.equal(args[0], "school-1");
        assert.deepEqual(args[1], ["owner", "admin"]);
        return {
          context: {
            schoolId: "school-1",
            schoolName: "Test School",
            role: "owner" as const,
            userId: "owner-1",
            schoolTeacherId: "teacher-link-1",
          },
          response: null,
        };
      },
      findAttachment: async () => overrides.attachment ?? {
        id: "attachment-1",
        schoolId: "school-1",
        incidentId: "incident-1",
        storedFilename: "admin/safeguarding/school-1/incident-1/file.pdf",
        originalName: "Concern note.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: body.byteLength,
      },
      downloadFileFromR2: async (objectKey: string) => {
        downloadedObjectKey = objectKey;
        return { body, contentType: "application/pdf", contentLength: body.byteLength };
      },
    },
    getDownloadedObjectKey: () => downloadedObjectKey,
  };
}

test("safeguarding evidence download rejects unauthenticated users before object access", async () => {
  let objectRequested = false;
  const response = await handleSafeguardingEvidenceDownload(context(), {
    requireSchoolRoles: async () => ({
      context: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }),
    findAttachment: async () => {
      throw new Error("metadata lookup should not run");
    },
    downloadFileFromR2: async () => {
      objectRequested = true;
      throw new Error("object download should not run");
    },
  });

  assert.equal(response.status, 401);
  assert.equal(objectRequested, false);
});

test("safeguarding evidence download rejects attachments from another school", async () => {
  const { deps, getDownloadedObjectKey } = okRoleDeps({
    attachment: {
      id: "attachment-1",
      schoolId: "school-2",
      incidentId: "incident-1",
      storedFilename: "admin/safeguarding/school-2/incident-1/file.pdf",
      originalName: "other-school.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 12,
    },
  });

  const response = await handleSafeguardingEvidenceDownload(context(), deps);

  assert.equal(response.status, 404);
  assert.equal(getDownloadedObjectKey(), null);
});

test("safeguarding evidence download rejects attachments from another incident", async () => {
  const { deps, getDownloadedObjectKey } = okRoleDeps({
    attachment: {
      id: "attachment-1",
      schoolId: "school-1",
      incidentId: "incident-2",
      storedFilename: "admin/safeguarding/school-1/incident-2/file.pdf",
      originalName: "other-incident.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 12,
    },
  });

  const response = await handleSafeguardingEvidenceDownload(context(), deps);

  assert.equal(response.status, 404);
  assert.equal(getDownloadedObjectKey(), null);
});

test("owner or admin can download safeguarding evidence through the app", async () => {
  const { deps, getDownloadedObjectKey } = okRoleDeps({ body: "protected evidence" });

  const response = await handleSafeguardingEvidenceDownload(context(), deps);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="Concern note.pdf"');
  assert.equal(getDownloadedObjectKey(), "admin/safeguarding/school-1/incident-1/file.pdf");
  assert.equal(await response.text(), "protected evidence");
});

test("safeguarding attachment metadata exposes downloadUrl, not raw publicUrl", () => {
  const view = toSafeguardingEvidenceAttachmentView({
    id: "attachment-1",
    schoolId: "school-1",
    incidentId: "incident-1",
    label: "Disclosure note",
    originalName: "disclosure.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 123,
    note: null,
    createdAt: new Date("2026-06-04T10:00:00.000Z"),
  });

  assert.equal(
    view.downloadUrl,
    buildSafeguardingEvidenceDownloadUrl({
      schoolId: "school-1",
      incidentId: "incident-1",
      attachmentId: "attachment-1",
    }),
  );
  assert.equal("publicUrl" in view, false);
});
