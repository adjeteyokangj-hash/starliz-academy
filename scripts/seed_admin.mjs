#!/usr/bin/env node

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const email = (getArg("--email") || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = getArg("--password") || process.env.ADMIN_PASSWORD || "";
  const name = (getArg("--name") || process.env.ADMIN_NAME || "Admin").trim();

  if (!email || !password) {
    console.error("Usage: node scripts/seed_admin.mjs --email admin@example.com --password <password> [--name 'Admin']");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      update: { role: "admin", passwordHash, name },
      create: { email, passwordHash, name, role: "admin" },
      select: { id: true, email: true, role: true },
    });
    console.log(`Admin ready: ${user.email} (${user.id}) role=${user.role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
