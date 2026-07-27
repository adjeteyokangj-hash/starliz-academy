/**
 * Idempotent repair: redact raw invite tokens from SchoolAuditLog.metadataJson.
 * Does not truncate or delete audit rows. No migration reset.
 */
import { readFileSync } from "node:fs";
import { redactInviteSecretsInMetadata } from "../src/lib/schools/invite-token-redaction";

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
  const { writeAuditLog } = await import("../src/lib/audit");

  const rows = await prisma.schoolAuditLog.findMany({
    where: {
      OR: [
        { metadataJson: { contains: "inviteToken" } },
        { metadataJson: { contains: "newToken" } },
        { metadataJson: { contains: "inviteUrl" } },
        { metadataJson: { contains: "token=" } },
      ],
    },
    select: { id: true, schoolId: true, actorUserId: true, metadataJson: true, action: true },
  });

  let affected = 0;
  let repaired = 0;
  for (const row of rows) {
    const result = redactInviteSecretsInMetadata(row.metadataJson);
    if (!result.changed || !result.next) continue;
    affected += 1;
    await prisma.schoolAuditLog.update({
      where: { id: row.id },
      data: { metadataJson: result.next },
    });
    repaired += 1;
    await writeAuditLog({
      actorUserId: row.actorUserId ?? "system",
      action: "invite_token_redacted",
      entityType: "school_audit_log",
      entityId: row.id,
      metadata: {
        schoolId: row.schoolId,
        originalAction: row.action,
        fields: result.fields,
      },
    });
  }

  const verifyRows = await prisma.schoolAuditLog.findMany({
    where: {
      OR: [
        { metadataJson: { contains: "inviteToken" } },
        { metadataJson: { contains: "newToken" } },
        { metadataJson: { contains: "inviteUrl" } },
      ],
    },
    select: { id: true, metadataJson: true },
  });
  let unredacted = 0;
  for (const row of verifyRows) {
    const again = redactInviteSecretsInMetadata(row.metadataJson);
    if (again.changed) unredacted += 1;
  }

  console.log(JSON.stringify({
    candidateRows: rows.length,
    affected,
    repaired,
    remainingUnredacted: unredacted,
    idempotent: unredacted === 0,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
