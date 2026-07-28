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
 * Ensures admin@starlizacademy.com is School Admin for StarLiz Academy School only.
 * This account must NOT have platform Admin / Super Admin access.
 * Must NOT become School Owner (ops-owner@starliz.dev retains ownership).
 */
const EMAIL = "admin@starlizacademy.com";
const PASSWORD =
  process.env.UAT_SCHOOL_ADMIN_PASSWORD ??
  process.env.E2E_SCHOOL_ADMIN_PASSWORD ??
  "Admin#2026";
const SCHOOL_NAME = "StarLiz Academy School";
const SCHOOL_ID_HINT = "cmpgzr6nc000jskjob867guo7";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const school = await prisma.school.findFirst({
    where: {
      OR: [{ id: SCHOOL_ID_HINT }, { name: SCHOOL_NAME }, { slug: "starliz-academy-school" }],
    },
    select: { id: true, name: true, slug: true, ownerUserId: true },
  });
  if (!school) {
    throw new Error(`School not found: ${SCHOOL_NAME}`);
  }

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      role: "teacher",
      passwordHash,
      name: "StarLiz Academy School Admin",
    },
    create: {
      email: EMAIL,
      passwordHash,
      name: "StarLiz Academy School Admin",
      role: "teacher",
    },
    select: { id: true, email: true, role: true },
  });

  // Never promote to platform admin.
  await prisma.adminUser.deleteMany({ where: { userId: user.id } });

  // Only StarLiz Academy School membership.
  await prisma.schoolTeacher.deleteMany({
    where: { userId: user.id, NOT: { schoolId: school.id } },
  });

  await prisma.schoolTeacher.upsert({
    where: { schoolId_userId: { schoolId: school.id, userId: user.id } },
    update: { role: "admin", status: "active" },
    create: {
      schoolId: school.id,
      userId: user.id,
      role: "admin",
      status: "active",
    },
  });

  // Do not claim school ownership — clear if this user was incorrectly set as owner.
  if (school.ownerUserId === user.id) {
    await prisma.school.update({
      where: { id: school.id },
      data: { ownerUserId: null },
    });
  }
  await prisma.school.updateMany({
    where: { ownerUserId: user.id },
    data: { ownerUserId: null },
  });

  const membership = await prisma.schoolTeacher.findUnique({
    where: { schoolId_userId: { schoolId: school.id, userId: user.id } },
    select: { role: true, status: true },
  });
  const adminCount = await prisma.adminUser.count({ where: { userId: user.id } });

  console.log(
    JSON.stringify({
      ok: true,
      email: user.email,
      userRole: user.role,
      schoolRole: membership?.role ?? null,
      schoolStatus: membership?.status ?? null,
      schoolId: school.id,
      schoolName: school.name,
      platformAdmin: adminCount > 0,
      ownedSchools: 0,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
