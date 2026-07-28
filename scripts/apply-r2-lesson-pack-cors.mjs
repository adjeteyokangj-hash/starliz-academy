/**
 * Apply private lesson-pack R2 CORS for the deployed Admin origin.
 * Does not print secrets, object keys, or credentials.
 */
import { readFileSync, existsSync } from "node:fs";
import {
  S3Client,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

function loadEnvLocal() {
  const env = {};
  if (!existsSync(".env.local")) return env;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i)] = v;
  }
  return env;
}

function pick(env, ...keys) {
  for (const k of keys) {
    const v = (process.env[k] || env[k] || "").trim();
    if (v) return v;
  }
  return null;
}

async function main() {
  const env = loadEnvLocal();
  const accountId = pick(env, "CLOUDFLARE_R2_ACCOUNT_ID");
  const bucket = pick(env, "CLOUDFLARE_R2_BUCKET", "CLOUDFLARE_R2_BUCKET_NAME");
  const accessKeyId = pick(env, "CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = pick(env, "CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const endpoint = pick(env, "CLOUDFLARE_R2_ENDPOINT")
    || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  const appUrl = pick(env, "NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL", "APP_URL");

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("R2 credentials/bucket incomplete in environment.");
  }
  if (!appUrl) throw new Error("App URL missing for CORS AllowedOrigins.");

  const origin = new URL(appUrl).origin;
  const origins = new Set([origin]);
  const host = new URL(appUrl).host;
  if (host.startsWith("www.")) {
    origins.add(`${new URL(appUrl).protocol}//${host.slice(4)}`);
  } else {
    origins.add(`${new URL(appUrl).protocol}//www.${host}`);
  }

  const client = new S3Client({
    region: pick(env, "CLOUDFLARE_R2_REGION") || "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  let before = null;
  try {
    const existing = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    before = (existing.CORSRules || []).map((r) => ({
      AllowedOrigins: r.AllowedOrigins,
      AllowedMethods: r.AllowedMethods,
      AllowedHeaders: r.AllowedHeaders,
      ExposeHeaders: r.ExposeHeaders,
      MaxAgeSeconds: r.MaxAgeSeconds,
    }));
  } catch {
    // Bucket may have no CORS config yet — treat as empty before state.
    before = [];
  }

  const rules = [
    {
      AllowedOrigins: [...origins],
      AllowedMethods: ["PUT"],
      AllowedHeaders: [
        "Content-Type",
        "Content-Length",
        "x-amz-content-sha256",
        "x-amz-date",
        "x-amz-security-token",
        "authorization",
      ],
      ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
      MaxAgeSeconds: 3600,
    },
  ];

  await client.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: { CORSRules: rules },
  }));

  const afterResp = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  const after = (afterResp.CORSRules || []).map((r) => ({
    AllowedOrigins: r.AllowedOrigins,
    AllowedMethods: r.AllowedMethods,
    AllowedHeaders: r.AllowedHeaders,
    ExposeHeaders: r.ExposeHeaders,
    MaxAgeSeconds: r.MaxAgeSeconds,
  }));

  console.log(JSON.stringify({
    ok: true,
    bucket: "REDACTED",
    endpointHost: new URL(endpoint).host,
    before,
    after,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
