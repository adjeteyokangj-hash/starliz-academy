import { PrismaClient } from "@prisma/client";
import { normalizePrismaDatabaseUrl } from "./prisma-database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUrl?: string;
};

const runtimeDatabaseUrl = normalizePrismaDatabaseUrl(process.env.DATABASE_URL);

if (globalForPrisma.prisma && globalForPrisma.prismaUrl !== runtimeDatabaseUrl) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

const prismaOptions =
  runtimeDatabaseUrl
    ? { datasources: { db: { url: runtimeDatabaseUrl } } }
    : process.env.NODE_ENV !== "production"
      ? { datasources: { db: { url: "file:./dev.db" } } }
      : undefined;

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUrl = runtimeDatabaseUrl;
}
