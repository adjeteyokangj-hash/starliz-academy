import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prismaOptions =
  process.env.DATABASE_URL
    ? { datasources: { db: { url: process.env.DATABASE_URL } } }
    : process.env.NODE_ENV !== "production"
      ? { datasources: { db: { url: "file:./dev.db" } } }
      : undefined;

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
