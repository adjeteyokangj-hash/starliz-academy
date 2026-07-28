/**
 * Must be imported first so Prisma clients see DATABASE_URL from .env.local.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    if (!raw || raw.startsWith("#") || !raw.includes("=")) continue;
    const i = raw.indexOf("=");
    const k = raw.slice(0, i).trim();
    let v = raw.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

const rawUrl = process.env.DATABASE_URL;
if (rawUrl) {
  const match = rawUrl.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)@(.+)$/i);
  if (match && !/%[0-9A-Fa-f]{2}/.test(match[3])) {
    process.env.DATABASE_URL = `${match[1]}${match[2]}:${encodeURIComponent(match[3])}@${match[4]}`;
  }
  // Prefer pooler when direct host is firewalled in this environment.
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}
