import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function withConservativePoolParams(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "postgres:" && protocol !== "postgresql:") {
      return rawUrl;
    }

    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "1");
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "20");
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const runtimeDatabaseUrl = withConservativePoolParams(process.env.DATABASE_URL);

const prismaOptions =
  runtimeDatabaseUrl
    ? { datasources: { db: { url: runtimeDatabaseUrl } } }
    : process.env.NODE_ENV !== "production"
      ? { datasources: { db: { url: "file:./dev.db" } } }
      : undefined;

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
