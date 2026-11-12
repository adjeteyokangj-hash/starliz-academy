import { PrismaClient } from "@prisma/client";
import { normalizePrismaDatabaseUrl } from "./prisma-database-url";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUrl?: string;
  worldQaTrace?: { modules: number; clients: number; listener: boolean };
  worldQaIdentity?: { client: PrismaClient; promise: Promise<void> };
  worldQaPoolReset?: Promise<void>;
};

const runtimeDatabaseUrl = normalizePrismaDatabaseUrl(process.env.DATABASE_URL);
const isolatedWorldQa = process.env.STARLIZ_WORLD_DB_QA === "1";
const isolatedDatabaseUrl = isolatedWorldQa && runtimeDatabaseUrl ? new URL(runtimeDatabaseUrl) : undefined;
if (isolatedDatabaseUrl) {
  // Keep the launcher's three-connection pool. A larger pool turns one brief
  // Docker port stall into several hung connects, which then time out while
  // Postgres still has idle capacity. A dead socket is discarded and the
  // operation is retried once, below.
  isolatedDatabaseUrl.searchParams.set("connection_limit", "3");
  isolatedDatabaseUrl.searchParams.set("pool_timeout", "20");
  isolatedDatabaseUrl.searchParams.set("connect_timeout", "10");
}
const prismaDatabaseUrl = isolatedDatabaseUrl?.toString() ?? runtimeDatabaseUrl;
if (isolatedWorldQa) {
  const target = new URL(prismaDatabaseUrl ?? "");
  if (target.hostname !== "127.0.0.1" || target.port !== "55432" || target.pathname !== "/starliz_game_world_test" || target.searchParams.get("sslmode") !== "disable" || process.env.DIRECT_URL !== process.env.DATABASE_URL) {
    throw new Error("WORLD_QA_WRONG_DATABASE_STOP");
  }
}

if (globalForPrisma.prisma && globalForPrisma.prismaUrl !== prismaDatabaseUrl) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

const prismaOptions =
  runtimeDatabaseUrl
    ? { datasources: { db: { url: prismaDatabaseUrl } }, ...(isolatedWorldQa ? { transactionOptions: { maxWait: 20000, timeout: 30000 }, log: [{ level: "query", emit: "event" } as const] } : {}) }
    : process.env.NODE_ENV !== "production"
      ? { datasources: { db: { url: "file:./dev.db" } } }
      : undefined;

const basePrisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);
function qaTrace(event: Record<string, unknown>) {
  if (isolatedWorldQa && process.env.WORLD_QA_DIRECTORY) appendFileSync(join(process.env.WORLD_QA_DIRECTORY, "prisma-observations.ndjson"), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...event }) + "\n");
}
if (isolatedWorldQa) {
  const trace = globalForPrisma.worldQaTrace ??= { modules: 0, clients: 0, listener: false };
  trace.modules++; if (!globalForPrisma.prisma) trace.clients++;
  qaTrace({ event: "module", modules: trace.modules, clients: trace.clients, poolLimit: new URL(prismaDatabaseUrl!).searchParams.get("connection_limit") });
  if (!trace.listener) {
    (basePrisma as unknown as { $on(event: string, listener: (event: { duration: number; query: string }) => void): void }).$on("query", event => qaTrace({ event: "query", durationMs: event.duration, verb: event.query.trim().split(/\s+/)[0] }));
    trace.listener = true;
  }
}
const pinnedQaDatabaseUrl = process.env.DATABASE_URL;
function qaPoolClosed(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "P1001" || code === "P2024") return true;
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  return message.includes("Engine is not yet connected");
}
function resetQaPool(error: unknown): Promise<void> {
  const existing = globalForPrisma.worldQaPoolReset;
  if (existing) return existing;
  const pending = (async () => {
    // "Engine is not yet connected" means the client has not finished
    // starting. Disconnecting it here drops the requests that are waiting.
    const notReady = typeof error === "object" && error !== null && "message" in error && String(error.message).includes("Engine is not yet connected");
    globalForPrisma.worldQaIdentity = undefined;
    if (!notReady) await basePrisma.$disconnect().catch(() => undefined);
    let connected = false;
    let last: unknown;
    for (let attempt = 0; attempt < 3 && !connected; attempt += 1) {
      try {
        await basePrisma.$connect();
        connected = true;
      } catch (connectError) {
        last = connectError;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!connected) throw last;
  })().finally(() => {
    if (globalForPrisma.worldQaPoolReset === pending) globalForPrisma.worldQaPoolReset = undefined;
  });
  globalForPrisma.worldQaPoolReset = pending;
  return pending;
}
async function verifyQaIdentity(): Promise<void> {
  if (globalForPrisma.worldQaIdentity?.client !== basePrisma) globalForPrisma.worldQaIdentity = { client: basePrisma, promise: (async () => {
    const started = Date.now(); qaTrace({ event: "identity-start" });
    const rows = await basePrisma.$queryRaw<Array<{ name: string; port: number }>>`SELECT current_database() AS name, inet_server_port() AS port`;
    if (rows[0]?.name !== "starliz_game_world_test" || rows[0]?.port !== 5432) throw new Error("WORLD_QA_CONNECTED_DATABASE_STOP");
    qaTrace({ event: "identity-verified", durationMs: Date.now() - started });
  })() };
  const current = globalForPrisma.worldQaIdentity;
  if (!current) throw new Error("WORLD_QA_IDENTITY_STOP");
  try {
    await current.promise;
  } catch (error) {
    if (qaPoolClosed(error) && globalForPrisma.worldQaIdentity === current) globalForPrisma.worldQaIdentity = undefined;
    throw error;
  }
}
// QA only: verify each immutable client datasource before its first operation.
// Subsequent operations retain the pinned URL. A refused or exhausted local
// pool is closed once and the same operation is tried again. A rejected
// identity for the wrong database stays rejected.
export const prisma = (isolatedWorldQa ? basePrisma.$extends({ query: {
  async $allOperations({ args, query }) {
    if (process.env.DATABASE_URL !== pinnedQaDatabaseUrl || process.env.DIRECT_URL !== pinnedQaDatabaseUrl) throw new Error("WORLD_QA_DATABASE_CHANGED_STOP");
    if (globalForPrisma.worldQaPoolReset) await globalForPrisma.worldQaPoolReset;
    try {
      await verifyQaIdentity();
      return await query(args);
    } catch (error) {
      if (!qaPoolClosed(error)) throw error;
      qaTrace({ event: "pool-reset", code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : "" });
      await resetQaPool(error);
      await verifyQaIdentity();
      return query(args);
    }
  },
} }) : basePrisma) as typeof basePrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.prismaUrl = prismaDatabaseUrl;
}
