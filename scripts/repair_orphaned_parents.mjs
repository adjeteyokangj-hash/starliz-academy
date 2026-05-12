#!/usr/bin/env node
/**
 * Repair Script: Fix Orphaned Parent Accounts
 * 
 * Finds all parent users without ParentProfile records and creates them.
 * This is a safe, idempotent operation that can be run repeatedly.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function repairOrphanedParents() {
  try {
    console.log("🔍 Scanning for parent users without profiles...\n");

    // Find all parent users
    const allParents = await prisma.user.findMany({
      where: { role: "parent" },
      include: { parentProfile: true },
      select: { id: true, email: true, name: true, parentProfile: true },
    });

    // Filter those without profiles
    const orphaned = allParents.filter((p) => !p.parentProfile);

    if (orphaned.length === 0) {
      console.log("✅ All parent accounts have complete profiles. Nothing to repair.");
      return;
    }

    console.log(`Found ${orphaned.length} orphaned parent account(s):\n`);
    orphaned.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.email} (${p.name || "no name"})`);
    });
    console.log();

    // Create missing profiles
    console.log("📝 Creating missing ParentProfile records...\n");

    let created = 0;
    let failed = 0;

    for (const parent of orphaned) {
      try {
        const profile = await prisma.parentProfile.create({
          data: {
            userId: parent.id,
            phone: "",
            status: "active",
            emailVerified: false,
            smsConsent: false,
            whatsappConsent: false,
            emailConsent: false,
          },
        });

        console.log(`  ✅ Created profile for ${parent.email} (ID: ${profile.id})`);
        created++;
      } catch (error) {
        console.log(`  ❌ Failed for ${parent.email}: ${error instanceof Error ? error.message : "Unknown error"}`);
        failed++;
      }
    }

    console.log();
    console.log(`📊 Results:`);
    console.log(`  Created: ${created}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total: ${created + failed}\n`);

    if (failed === 0) {
      console.log("✅ All repairs completed successfully!");
    } else {
      console.log(`⚠️  ${failed} repair(s) failed. Check the output above.`);
    }
  } catch (error) {
    console.error("❌ Repair script error:", error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
}

repairOrphanedParents();
