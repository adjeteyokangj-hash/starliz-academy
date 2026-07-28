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
  const rawUrl = process.env.DATABASE_URL;
  if (rawUrl) {
    const match = rawUrl.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)@(.+)$/i);
    if (match && !/%[0-9A-Fa-f]{2}/.test(match[3])) {
      process.env.DATABASE_URL = `${match[1]}${match[2]}:${encodeURIComponent(match[3])}@${match[4]}`;
    }
    if (!process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
}

loadEnvLocal();

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Ensures a genuine platform Super Admin for local/UAT.
 * Separate from ops-owner@starliz.dev (school owner only).
 */
const EMAIL =
  process.env.UAT_ADMIN_EMAIL ??
  process.env.E2E_OPS_ADMIN_EMAIL ??
  "platform-admin@starliz.dev";
const PASSWORD =
  process.env.UAT_ADMIN_PASSWORD ??
  process.env.E2E_OPS_ADMIN_PASSWORD ??
  "PlatformAdmin#2026";

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
  if (EMAIL.toLowerCase() === "ops-owner@starliz.dev") {
    throw new Error(
      "ops-owner@starliz.dev is reserved as StarLiz Academy School Owner. Use platform-admin@starliz.dev (or UAT_ADMIN_EMAIL) for platform Admin.",
    );
  }

  const hash = await bcrypt.hash(PASSWORD, 12);

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
    where: { email: EMAIL.toLowerCase() },
    update: { role: "admin", passwordHash: hash, name: "Platform Admin" },
    create: {
      email: EMAIL.toLowerCase(),
      passwordHash: hash,
      name: "Platform Admin",
      role: "admin",
    },
    select: { id: true, email: true, role: true },
  });

  await prisma.adminUser.upsert({
    where: { userId: user.id },
    update: { roleId: superAdminRole.id, active: true, isLocked: false, lockedReason: null },
    create: {
      userId: user.id,
      roleId: superAdminRole.id,
      active: true,
      title: "UAT Platform Super Admin",
    },
  });

  console.log(JSON.stringify({ ok: true, email: user.email, role: user.role, platformAdmin: true }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });