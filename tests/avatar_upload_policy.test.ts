import test from "node:test";
import assert from "node:assert/strict";
import { handleUpload } from "../src/app/api/upload/route";

function requestFor(file: File, folder: string): Request {
  const form = new FormData();
  form.set("file", file);
  form.set("folder", folder);
  return new Request("https://starliz.test/api/upload", { method: "POST", body: form });
}

function deps() {
  const uploads: Array<{ objectKey: string; mimeType: string }> = [];
  return {
    uploads,
    deps: {
      requireAdmin: async () => ({
        session: { userId: "admin-1", email: "admin@starliz.test", role: "admin" as const },
        response: null,
      }),
      generateR2ObjectKey: (input: { folder: string; originalFilename: string; mimeType: string }) =>
        `${input.folder}/2026/06/04/test-${input.originalFilename}`,
      uploadFileToR2: async (input: { objectKey: string; mimeType: string }) => {
        uploads.push({ objectKey: input.objectKey, mimeType: input.mimeType });
        return { objectKey: input.objectKey, publicUrl: `https://media.starliz.test/${input.objectKey}` };
      },
    },
  };
}

for (const [mimeType, filename] of [
  ["image/png", "avatar.png"],
  ["image/jpeg", "avatar.jpg"],
  ["image/webp", "avatar.webp"],
  ["image/gif", "avatar.gif"],
] as const) {
  test(`avatar upload accepts ${mimeType}`, async () => {
    const setup = deps();
    const response = await handleUpload(requestFor(new File(["bytes"], filename, { type: mimeType }), "avatars"), setup.deps);
    const payload = await response.json() as { ok?: boolean; publicUrl?: string; mimeType?: string };

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.mimeType, mimeType);
    assert.equal(payload.publicUrl, `https://media.starliz.test/avatars/2026/06/04/test-${filename}`);
    assert.equal(setup.uploads.length, 1);
  });
}

for (const [mimeType, filename] of [
  ["image/svg+xml", "avatar.svg"],
  ["application/pdf", "avatar.pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "avatar.docx"],
  ["audio/mpeg", "avatar.mp3"],
  ["video/mp4", "avatar.mp4"],
] as const) {
  test(`avatar upload rejects ${mimeType}`, async () => {
    const setup = deps();
    const response = await handleUpload(requestFor(new File(["bytes"], filename, { type: mimeType }), "avatars"), setup.deps);
    const payload = await response.json() as { error?: string };

    assert.equal(response.status, 400);
    assert.match(payload.error ?? "", /Avatar uploads must be non-identifying/);
    assert.equal(setup.uploads.length, 0);
  });
}

test("non-avatar folders keep existing upload policy", async () => {
  const setup = deps();
  const response = await handleUpload(
    requestFor(new File(["pdf"], "worksheet.pdf", { type: "application/pdf" }), "lessons"),
    setup.deps,
  );
  const payload = await response.json() as { ok?: boolean; folder?: string; mimeType?: string };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.folder, "lessons");
  assert.equal(payload.mimeType, "application/pdf");
  assert.equal(setup.uploads.length, 1);
});
