/**
 * Policy publication readiness / selective publish.
 * Default: dry-run inventory only (never mass-publishes).
 *
 * Inventory:
 *   npx tsx scripts/policy-publication-readiness.ts
 *
 * Selective publish (requires prior approve + explicit env confirmation):
 *   LAUNCH_POLICY_PUBLISH_APPROVED=true LAUNCH_POLICY_PUBLISH_SLUGS=terms,privacy npx tsx scripts/policy-publication-readiness.ts --publish
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const publishMode = process.argv.includes("--publish");
const approved = String(process.env.LAUNCH_POLICY_PUBLISH_APPROVED ?? "").trim().toLowerCase() === "true";
const slugList = String(process.env.LAUNCH_POLICY_PUBLISH_SLUGS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const docs = await prisma.policyDocumentRecord.findMany({
    include: { versions: { orderBy: { version: "desc" }, take: 5 } },
    orderBy: { title: "asc" },
  });
  const help = await prisma.helpArticleRecord.findMany({
    orderBy: { title: "asc" },
  });

  let draft = 0;
  let approvedCount = 0;
  let published = 0;
  for (const doc of docs) {
    const current = doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions[0];
    const status = current?.status ?? "missing";
    if (status === "published") published += 1;
    else if (status === "approved") approvedCount += 1;
    else draft += 1;
    console.log(`POLICY ${doc.slug} visibility=${doc.visibility} status=${status}`);
  }
  console.log(`SUMMARY policies=${docs.length} draftish=${draft} approved=${approvedCount} published=${published}`);

  let helpPublished = 0;
  for (const article of help) {
    if (article.status === "published" && article.visibility === "public") helpPublished += 1;
    console.log(`HELP ${article.slug} visibility=${article.visibility} status=${article.status}`);
  }
  console.log(`SUMMARY help=${help.length} publishedPublic=${helpPublished}`);

  console.log("REVIEW_REQUIRED solicitor=pending DSL=pending DPO=pending");
  console.log("RULE do_not_mass_publish_unreviewed_drafts");

  if (!publishMode) {
    console.log("MODE=inventory-only");
    return;
  }

  if (!approved) {
    console.error("BLOCKED: set LAUNCH_POLICY_PUBLISH_APPROVED=true after solicitor/DSL/DPO sign-off");
    process.exit(2);
  }
  if (slugList.length === 0) {
    console.error("BLOCKED: set LAUNCH_POLICY_PUBLISH_SLUGS=comma,separated,slugs");
    process.exit(2);
  }

  const { publishPolicy } = await import("../src/lib/policies/cms");
  const actor = await prisma.user.findFirst({
    where: { role: "admin", adminProfile: { active: true, role: { name: "SUPER_ADMIN" } } },
    select: { id: true, email: true },
  });
  if (!actor) {
    console.error("BLOCKED: no Super Admin actor for publish audit");
    process.exit(2);
  }

  for (const slug of slugList) {
    try {
      const result = await publishPolicy({ actorUserId: actor.id, slug, note: "Launch readiness selective publish" });
      console.log(`PUBLISHED ${slug} version=${result.version.version} idempotent=${result.idempotent}`);
    } catch (error) {
      console.error(`FAILED ${slug}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });