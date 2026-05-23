#!/usr/bin/env node

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const SUPER_ADMIN_PERMISSIONS = [
  "MANAGE_USERS",
  "MANAGE_ADMINS",
  "MANAGE_ROLES",
  "VIEW_AUDIT_LOGS",
  "MANAGE_CONTENT",
  "APPROVE_CONTENT",
  "MANAGE_ASSIGNMENTS",
  "VIEW_PROGRESS",
  "MANAGE_BILLING",
  "MANAGE_SUBSCRIPTIONS",
  "MANAGE_INTEGRATIONS",
  "MANAGE_API_KEYS",
  "MANAGE_SETTINGS",
  "MANAGE_BRANDING",
  "MANAGE_SECURITY",
  "VIEW_REPORTS",
  "EXPORT_DATA",
  "ARCHIVE_RECORDS",
  "DELETE_RECORDS",
  "MANAGE_INBOX",
];

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

    const superAdminRole = await prisma.adminRole.upsert({
      where: { name: "SUPER_ADMIN" },
      update: {
        description: "Full system access - can manage everything",
        permissions: JSON.stringify(SUPER_ADMIN_PERMISSIONS),
        isBuiltIn: true,
      },
      create: {
        name: "SUPER_ADMIN",
        description: "Full system access - can manage everything",
        permissions: JSON.stringify(SUPER_ADMIN_PERMISSIONS),
        isBuiltIn: true,
      },
      select: { id: true, name: true },
    });

    const user = await prisma.user.upsert({
      where: { email },
      update: { role: "admin", passwordHash, name },
      create: { email, passwordHash, name, role: "admin" },
      select: { id: true, email: true, role: true },
    });

    const adminCount = await prisma.adminUser.count();
    const shouldBeSuperAdmin = adminCount === 0;

    const adminProfile = await prisma.adminUser.upsert({
      where: { userId: user.id },
      update: shouldBeSuperAdmin
        ? { roleId: superAdminRole.id, active: true, isLocked: false, lockedReason: null }
        : { active: true },
      create: {
        userId: user.id,
        roleId: shouldBeSuperAdmin ? superAdminRole.id : null,
        active: true,
      },
      include: { role: { select: { name: true } } },
    });

    console.log(
      `Admin ready: ${user.email} (${user.id}) role=${user.role} adminRole=${adminProfile.role?.name ?? "none"}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
