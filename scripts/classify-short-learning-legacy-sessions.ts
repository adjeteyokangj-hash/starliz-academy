/**
 * Idempotent, non-destructive Short Learning legacy-session classification.
 * Existing ready sessions become metadata-classified as legacy_generated,
 * never implicitly Admin-reviewed or published.
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
  const { classifyLegacyShortLearningSessions } = await import(
    "../src/lib/schools/short-learning-journey"
  );

  const actor = await prisma.user.findFirst({
    where: {
      role: "admin",
      adminProfile: { active: true, isLocked: false, role: { name: "SUPER_ADMIN" } },
    },
    select: { id: true },
  });
  if (!actor) throw new Error("An active Super Admin is required to audit the classification.");

  const first = await classifyLegacyShortLearningSessions(actor.id);
  const second = await classifyLegacyShortLearningSessions(actor.id);
  console.log(JSON.stringify({ first, second, idempotent: second.classified === 0 }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
