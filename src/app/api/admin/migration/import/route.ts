import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { importMigrationDump, migrationDumpSchema } from "@/lib/migration/pipeline";

const importEnvelopeSchema = z.union([
  migrationDumpSchema,
  z.object({
    dryRun: z.boolean().optional(),
    confirmProductionHost: z.string().optional(),
    dump: migrationDumpSchema,
  }),
]);

function resolveProductionDbHost(): string | null {
  const url = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  return NextResponse.json({
    ok: true,
    requiredHost: resolveProductionDbHost(),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = importEnvelopeSchema.parse(await request.json());
    const dryRun = "dump" in body ? (body.dryRun ?? true) : true;
    const dump = "dump" in body ? body.dump : body;
    const confirmProductionHost = "dump" in body ? body.confirmProductionHost?.trim() : undefined;
    const requiredHost = resolveProductionDbHost();

    if (!dryRun && requiredHost && confirmProductionHost !== requiredHost) {
      return NextResponse.json(
        { error: `Host confirmation mismatch. Expected ${requiredHost}.` },
        { status: 400 },
      );
    }

    const { report, parsed } = await importMigrationDump({
      dump,
      dryRun,
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: dryRun ? "migration_import_dry_run" : "migration_import_applied",
      entityType: "migration",
      metadata: {
        version: parsed.version,
        counts: report.summary,
        errorCount: report.errors.length,
      },
    });

    return NextResponse.json({ ok: true, dryRun, report });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid migration payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Migration import failed." }, { status: 500 });
  }
}
