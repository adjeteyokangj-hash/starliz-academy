/**
 * Deploy additive Human Support migration only (no reset).
 * Prefers DIRECT_URL; if unreachable, tries pooler session mode (:5432),
 * then falls back to executing SQL via Prisma against DATABASE_URL.
 *
 * Usage: npx tsx scripts/deploy-human-support-migration.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import net from "node:net";
import { createHash } from "node:crypto";

const MIGRATION_NAME = "20260724180000_human_support_availability";
const MIGRATION_SQL = resolve(
  "prisma/migrations/20260724180000_human_support_availability/migration.sql",
);

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(process.env[k] ?? "").trim()) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

function parseHostPort(url: string): { host: string; port: number } | null {
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
    return { host: u.hostname, port: Number(u.port || 5432) };
  } catch {
    return null;
  }
}

function withPort(url: string, port: number): string {
  const u = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
  u.port = String(port);
  return url.startsWith("postgresql:")
    ? `postgresql:${u.toString().slice("http:".length)}`
    : `postgres:${u.toString().slice("http:".length)}`;
}

function canConnect(host: string, port: number, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolvePromise(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

async function tryMigrateDeploy(directUrl: string): Promise<boolean> {
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: { ...process.env, DIRECT_URL: directUrl },
      timeout: 90_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function applyViaPrismaClient() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const sql = readFileSync(MIGRATION_SQL, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  try {
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
      MIGRATION_NAME,
    );
    if (existing.length > 0) {
      console.log(`[migrate] ${MIGRATION_NAME} already recorded — skipping SQL apply.`);
      return;
    }
  } catch {
    // table may not exist yet on brand-new DBs; continue
  }

  // Split on blank lines / statements; keep enum/table order as written.
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(`[migrate] Applying ${statements.length} SQL statements via PrismaClient…`);
  for (const statement of statements) {
    const body = statement.endsWith(";") ? statement : `${statement};`;
    try {
      await prisma.$executeRawUnsafe(body);
    } catch (error) {
      const message = String(error);
      // Idempotent: ignore already-exists
      if (/already exists|duplicate/i.test(message)) {
        console.log(`[migrate] skip existing: ${body.slice(0, 60)}…`);
        continue;
      }
      throw error;
    }
  }

  const finished = new Date();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT DO NOTHING`,
    `manual-${MIGRATION_NAME}`,
    checksum,
    finished,
    MIGRATION_NAME,
    null,
    null,
    finished,
    1,
  );
  console.log(`[migrate] Recorded ${MIGRATION_NAME} in _prisma_migrations.`);
  await prisma.$disconnect();
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");

  const candidates: string[] = [];
  if (process.env.DIRECT_URL) candidates.push(process.env.DIRECT_URL);
  // Session-mode pooler often works when db.*:5432 is firewalled.
  try {
    candidates.push(withPort(process.env.DATABASE_URL, 5432));
  } catch {
    // ignore
  }
  candidates.push(process.env.DATABASE_URL);

  for (const url of candidates) {
    const target = parseHostPort(url);
    if (!target) continue;
    const ok = await canConnect(target.host, target.port);
    console.log(`[migrate] probe ${target.host}:${target.port} → ${ok ? "open" : "closed"}`);
    if (!ok) continue;
    process.env.DIRECT_URL = url;
    console.log(`[migrate] trying migrate deploy via ${target.host}:${target.port}`);
    const deployed = await tryMigrateDeploy(url);
    if (deployed) {
      console.log("migrate deploy complete");
      return;
    }
    console.log(`[migrate] migrate deploy failed on ${target.host}:${target.port}`);
  }

  console.log("[migrate] Falling back to PrismaClient SQL apply (additive only, no reset).");
  await applyViaPrismaClient();
  console.log("migrate apply complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
