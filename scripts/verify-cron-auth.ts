/**
 * Cron auth + authorised invocation smoke for launch readiness.
 * Loads CRON_SECRET from .env.local; never prints the secret.
 *
 * Usage: UAT_BASE_URL=http://localhost:3000 npx tsx scripts/verify-cron-auth.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const base = (process.env.UAT_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = (process.env.CRON_SECRET ?? "").trim();

const jobs = [
  "/api/cron/tutor-presence-sweep",
  "/api/cron/short-learning-lifecycle",
  "/api/cron/short-learning-reminders",
];

async function probe(path: string, headers?: Record<string, string>) {
  const res = await fetch(`${base}${path}`, { method: "GET", headers, cache: "no-store" });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`BASE=${base}`);
  console.log(`CRON_SECRET=${secret ? "present" : "MISSING"}`);
  if (!secret) {
    console.error("BLOCKED: CRON_SECRET missing");
    process.exit(2);
  }

  for (const path of jobs) {
    const unauth = await probe(path);
    const okUnauth = unauth.status === 401 || unauth.status === 403;
    console.log(`UNAUTH ${path} status=${unauth.status} pass=${okUnauth}`);

    const auth = await probe(path, { Authorization: `Bearer ${secret}` });
    const okAuth = auth.status >= 200 && auth.status < 300;
    console.log(`AUTH ${path} status=${auth.status} pass=${okAuth}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});