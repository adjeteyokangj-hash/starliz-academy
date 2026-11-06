import test from "node:test";
import assert from "node:assert/strict";
import { sameCodingUploadOrigin } from "../src/lib/coding/learning/upload-origin";

test("development uploads preserve exact browser origin despite Next loopback normalisation", () => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "development" });
  try {
    const request = (origin: string, host = "127.0.0.1:39123") => new Request("http://localhost:39123/api/student/coding/demonstrations", { headers: { Origin: origin, Host: host } });
    assert.equal(sameCodingUploadOrigin(request("http://127.0.0.1:39123")), true);
    assert.equal(sameCodingUploadOrigin(request("http://localhost:39123")), false, "Distinct browser origins must remain distinct.");
    assert.equal(sameCodingUploadOrigin(request("http://127.0.0.1:39124")), false);
    assert.equal(sameCodingUploadOrigin(request("https://foreign.invalid")), false);
    assert.equal(sameCodingUploadOrigin(request("http://127.0.0.1:39123", "foreign.invalid:39123")), false);
    assert.equal(sameCodingUploadOrigin(new Request("http://localhost:39123", { headers: { Host: "127.0.0.1:39123" } })), false);
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Reflect.set(process.env, "NODE_ENV", previous); }
});

test("production upload origin remains strict and ignores forwarded or loopback aliases", () => {
  const previous = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: "production" });
  try {
    assert.equal(sameCodingUploadOrigin(new Request("https://academy.example.invalid/api/student/coding/demonstrations", { headers: { Origin: "https://academy.example.invalid" } })), true);
    assert.equal(sameCodingUploadOrigin(new Request("https://academy.example.invalid/api/student/coding/demonstrations", { headers: { Origin: "https://foreign.invalid", "X-Forwarded-Host": "foreign.invalid" } })), false);
    assert.equal(sameCodingUploadOrigin(new Request("http://localhost:39123", { headers: { Origin: "http://127.0.0.1:39123", Host: "127.0.0.1:39123" } })), false);
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Reflect.set(process.env, "NODE_ENV", previous); }
});
