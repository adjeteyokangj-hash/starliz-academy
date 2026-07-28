/**
 * Gate 5 — additive, idempotent backfill of code-managed policies + knowledge into CMS.
 * Imports as drafts only — never auto-publishes. Safe to re-run.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i < 1) continue;
  let v = s.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  const key = s.slice(0, i).trim();
  if (process.env[key] === undefined) process.env[key] = v;
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { ALL_POLICY_DOCUMENTS } = await import("../src/lib/policies/registry");
  const { KNOWLEDGE_ARTICLES } = await import("../src/lib/knowledge/articles");
  const { serializePolicyBody } = await import("../src/lib/policies/cms");

  let policiesCreated = 0;
  let policiesSkipped = 0;
  let helpCreated = 0;
  let helpSkipped = 0;

  for (const doc of ALL_POLICY_DOCUMENTS) {
    const existing = await prisma.policyDocumentRecord.findUnique({ where: { slug: doc.slug } });
    if (existing) {
      policiesSkipped += 1;
      continue;
    }
    const created = await prisma.policyDocumentRecord.create({
      data: {
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        visibility: doc.publicVisible === false ? "internal" : "public",
        audienceJson: JSON.stringify(doc.audience),
        versions: {
          create: {
            version: doc.version || "0.9.0-draft",
            status: "draft",
            contentJson: serializePolicyBody(doc),
            changeLog: "Backfilled from code-managed Phase 6 registry as draft (not auto-approved).",
            approvalHistoryJson: JSON.stringify([
              {
                action: "backfilled",
                actorUserId: "system-backfill",
                at: new Date().toISOString(),
                note: "Awaiting explicit review before approval/publication",
              },
            ]),
            effectiveDate: doc.effectiveDate ? new Date(doc.effectiveDate) : null,
          },
        },
      },
      include: { versions: true },
    });
    await prisma.policyDocumentRecord.update({
      where: { id: created.id },
      data: { currentVersionId: created.versions[0].id },
    });
    policiesCreated += 1;
  }

  for (const article of KNOWLEDGE_ARTICLES) {
    const slug = article.id;
    const existing = await prisma.helpArticleRecord.findUnique({ where: { slug } });
    if (existing) {
      helpSkipped += 1;
      continue;
    }
    await prisma.helpArticleRecord.create({
      data: {
        slug,
        title: article.title,
        summary: article.summary,
        category: article.category,
        audience: article.audience,
        visibility: article.audience === "Platform Admin" ? "internal" : "public",
        status: "draft",
        bodyJson: JSON.stringify(article.body ?? [article.summary]),
        keywordsJson: JSON.stringify(article.keywords),
        relatedPolicySlug: article.href?.startsWith("/policies/")
          ? article.href.replace("/policies/", "")
          : article.href === "/short-learning"
            ? "short-learning-policy"
            : null,
        version: "1.0.0-draft",
        authorId: "system-backfill",
      },
    });
    helpCreated += 1;
  }

  console.log(
    JSON.stringify(
      {
        policiesCreated,
        policiesSkipped,
        helpCreated,
        helpSkipped,
        note: "All imports are drafts. Explicit approve+publish required before public CMS serving.",
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  try {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});
