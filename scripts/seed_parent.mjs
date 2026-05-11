#!/usr/bin/env node

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] || "").trim().toLowerCase();
const password = process.argv[3] || "";
const name = process.argv[4] || "Parent";

if (!email || !password) {
  console.error("Usage: node scripts/seed_parent.mjs <email> <password> [name]");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role: "parent" },
    create: { email, passwordHash, name, role: "parent" },
    select: { id: true, email: true, role: true },
  });
  console.log(`Parent ready: ${user.email} (${user.id}) role=${user.role}`);
} finally {
  await prisma.$disconnect();
}
