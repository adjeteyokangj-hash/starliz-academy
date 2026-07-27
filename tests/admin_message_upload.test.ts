import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { handleAdminMessageUpload } from "../src/app/api/admin/messages/upload/route";

function uploadRequest(file: File): Request {
  const form = new FormData();
  form.set("file", file);
  return new Request("https://starliz.test/api/admin/messages/upload", {
    method: "POST",
    body: form,
  });
}

function makeDeps(overrides: {
  session?: { userId: string; email: string; role: "admin" } | null;
  permission?: boolean;
  publicUrl?: string;
} = {}) {
  const calls: Array<{ objectKey: string; mimeType: string; bodyLength: number; cacheControl?: string }> = [];

  return {
    deps: {
      requireAdminPermission: async () => {
        if (overrides.session === null) {
          return {
            session: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
          };
        }
        if (overrides.permission === false) {
          return {
            session: null,
            response: NextResponse.json({ error: "Permission denied" }, { status: 403 }),
          };
        }
        return {
          session: overrides.session ?? { userId: "admin-user-1", email: "admin@starliz.test", role: "admin" },
          response: null,
          context: {
            userId: "admin-user-1",
            email: "admin@starliz.test",
            adminUserId: "admin-profile-1",
            roleId: "role-1",
            roleName: "ADMIN",
            permissions: ["MANAGE_INBOX"] as const,
            isSuperAdmin: false,
            active: true,
            isLocked: false,
          },
        };
      },
      uploadFileToR2: async (input: {
        objectKey: string;
        body: Buffer | Uint8Array;
        mimeType: string;
        cacheControl?: string;
      }) => {
        calls.push({
          objectKey: input.objectKey,
          mimeType: input.mimeType,
          bodyLength: input.body.byteLength,
          cacheControl: input.cacheControl,
        });
        return {
          objectKey: input.objectKey,
          publicUrl: overrides.publicUrl ?? `https://media.starliz.test/${input.objectKey}`,
        };
      },
      now: () => new Date("2026-06-04T12:00:00.000Z"),
      randomUUID: () => "uuid-123",
    },
    calls,
  };
}

test("admin message upload rejects unauthenticated users", async () => {
  const { deps, calls } = makeDeps({ session: null });
  const file = new File(["image-bytes"], "photo.jpg", { type: "image/jpeg" });

  const response = await handleAdminMessageUpload(uploadRequest(file), deps as never);

  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("admin message upload rejects admins without messaging permission", async () => {
  const { deps, calls } = makeDeps({ permission: false });
  const file = new File(["image-bytes"], "photo.jpg", { type: "image/jpeg" });

  const response = await handleAdminMessageUpload(uploadRequest(file), deps as never);
  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 403);
  assert.equal(payload.error, "Permission denied");
  assert.equal(calls.length, 0);
});

test("admin message upload rejects document attachments", async () => {
  const { deps, calls } = makeDeps();
  const file = new File(["pdf-bytes"], "sensitive.pdf", { type: "application/pdf" });

  const response = await handleAdminMessageUpload(uploadRequest(file), deps as never);
  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 400);
  assert.match(payload.error ?? "", /image or audio files only/);
  assert.equal(calls.length, 0);
});

test("admin message upload stores allowed media in R2 and returns Twilio-compatible public HTTPS URL", async () => {
  const { deps, calls } = makeDeps();
  const file = new File(["image-bytes"], "photo.jpg", { type: "image/jpeg" });

  const response = await handleAdminMessageUpload(uploadRequest(file), deps as never);
  const payload = await response.json() as {
    url?: string;
    deliveryUrl?: string;
    objectKey?: string;
    purpose?: string;
    warning?: string;
  };

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].objectKey, "admin/messages/2026/06/04/uuid-123.jpg");
  assert.equal(calls[0].mimeType, "image/jpeg");
  assert.equal(calls[0].bodyLength, "image-bytes".length);
  assert.equal(calls[0].cacheControl, "public, max-age=86400");
  assert.equal(calls[0].objectKey.includes("public/uploads/messages"), false);
  assert.equal(payload.objectKey, calls[0].objectKey);
  assert.equal(payload.url, "https://media.starliz.test/admin/messages/2026/06/04/uuid-123.jpg");
  assert.equal(payload.deliveryUrl, payload.url);
  assert.equal(payload.purpose, "twilio_delivery_media");
  assert.match(payload.warning ?? "", /non-sensitive/);
});

test("admin message upload rejects non-public delivery URLs from storage", async () => {
  const { deps, calls } = makeDeps({ publicUrl: "http://localhost/uploads/messages/photo.jpg" });
  const file = new File(["audio-bytes"], "note.mp3", { type: "audio/mpeg" });

  const response = await handleAdminMessageUpload(uploadRequest(file), deps as never);
  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 400);
  assert.equal(calls.length, 1);
  assert.match(payload.error ?? "", /public HTTPS delivery URL/);
});
