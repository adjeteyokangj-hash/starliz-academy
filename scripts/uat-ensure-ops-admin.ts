import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load .env.local into process.env without printing values. */
function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env) || !String(process.env[key] ?? "").trim()) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore missing file
  }
}

loadEnvLocal();

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

const prisma = new PrismaClient();

async function main() {
  const email = "ops-owner@starliz.dev";
  const password = "OpsAdmin#2026";
  const hash = await bcrypt.hash(password, 12);

  const superAdminRole = await prisma.adminRole.upsert({
    where: { name: "SUPER_ADMIN" },
    update: {
      permissions: JSON.stringify(SUPER_ADMIN_PERMISSIONS),
      isBuiltIn: true,
    },
    create: {
      name: "SUPER_ADMIN",
      description: "Full system access",
      permissions: JSON.stringify(SUPER_ADMIN_PERMISSIONS),
      isBuiltIn: true,
    },
    select: { id: true },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "admin", passwordHash: hash, name: "Ops Owner" },
    create: { email, passwordHash: hash, name: "Ops Owner", role: "admin" },
    select: { id: true, email: true, role: true },
  });

  await prisma.adminUser.upsert({
    where: { userId: user.id },
    update: { roleId: superAdminRole.id, active: true, isLocked: false, lockedReason: null },
    create: {
      userId: user.id,
      roleId: superAdminRole.id,
      active: true,
      title: "UAT Super Admin",
    },
  });

  console.log(JSON.stringify({ ok: true, email: user.email, role: user.role }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
