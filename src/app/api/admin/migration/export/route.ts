import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { exportMigrationDump } from "@/lib/migration/pipeline";

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const dump = await exportMigrationDump();

  await writeAuditLog({
    actorUserId: session.userId,
    action: "migration_export_generated",
    entityType: "migration",
    metadata: {
      scope: ["parents", "lessons", "contentLibrary", "assignments"],
      counts: {
        parents: dump.data.parents.length,
        children: dump.data.parents.reduce((total, parent) => total + parent.children.length, 0),
        lessons: dump.data.lessons.length,
        contentLibrary: dump.data.contentLibrary.length,
        assignments: dump.data.assignments.length,
      },
    },
  });

  return NextResponse.json({ ok: true, dump });
}
