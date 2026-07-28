import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import Busboy from "busboy";
import type { FileInfo, FieldInfo } from "busboy";

const UPLOAD_ROUTE = "src/app/api/admin/lesson-pack-import/upload/route.ts";

test("upload route compiles against Busboy FileInfo and FieldInfo declarations", () => {
  const src = readFileSync(UPLOAD_ROUTE, "utf8");
  assert.match(src, /import type \{ FileInfo, FieldInfo \} from "busboy"/);
  assert.match(src, /info: FileInfo/);
  assert.match(src, /info: FieldInfo/);
  assert.match(src, /err: unknown/);
  assert.match(src, /fieldname: string/);
  assert.match(src, /fileStream: Readable/);
  assert.equal(/@ts-ignore|@ts-expect-error|\bany\b/.test(src), false);
});

test("file event callback uses typed FileInfo", () => {
  const info: FileInfo = {
    filename: "pack.zip",
    encoding: "7bit",
    mimeType: "application/zip",
  };
  const onFile = (
    fieldname: string,
    fileStream: Readable & { truncated?: boolean },
    fileInfo: FileInfo,
  ) => {
    assert.equal(fieldname, "files");
    assert.equal(fileInfo.filename, "pack.zip");
    assert.equal(fileInfo.mimeType, "application/zip");
    fileStream.resume();
  };
  onFile("files", Readable.from([]), info);
});

test("field callback uses typed values and FieldInfo", () => {
  const info: FieldInfo = {
    encoding: "utf8",
    mimeType: "text/plain",
    nameTruncated: false,
    valueTruncated: false,
  };
  const fields: Record<string, string> = {};
  const onField = (name: string, value: string, fieldInfo: FieldInfo) => {
    fields[name] = value;
    assert.equal(fieldInfo.nameTruncated, false);
    assert.equal(typeof value, "string");
  };
  onField("licenceType", "OGL", info);
  assert.equal(fields.licenceType, "OGL");
});

test("stream error callback is typed as unknown", () => {
  const onError = (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, "parse failed");
  };
  onError(new Error("parse failed"));
});

test("Busboy instance accepts typed file/field/error listeners", async () => {
  const bb = Busboy({
    headers: { "content-type": "multipart/form-data; boundary=----bound" },
    limits: { files: 1, fileSize: 1024 },
  });

  let sawErrorType = false;
  bb.on("file", (fieldname: string, fileStream: Readable & { truncated?: boolean }, info: FileInfo) => {
    assert.equal(typeof fieldname, "string");
    assert.equal(typeof info.filename, "string");
    fileStream.resume();
  });
  bb.on("field", (name: string, value: string, info: FieldInfo) => {
    assert.equal(typeof name, "string");
    assert.equal(typeof value, "string");
    assert.equal(typeof info.valueTruncated, "boolean");
  });
  bb.on("error", (err: unknown) => {
    sawErrorType = typeof err !== "undefined";
  });

  await new Promise<void>((resolve, reject) => {
    bb.on("close", () => resolve());
    bb.on("error", reject);
    const body = [
      "------bound",
      'Content-Disposition: form-data; name="licenceType"',
      "",
      "OGL",
      "------bound--",
      "",
    ].join("\r\n");
    bb.end(Buffer.from(body));
  });

  assert.equal(sawErrorType, false);
});