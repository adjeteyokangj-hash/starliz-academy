import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  buildGaBulkImportCommitSummary,
  isGaWordSchemaNotReadyError,
  listGaSources,
  parseGaBulkImportText,
  planGaBulkImportCommit,
  previewGaBulkImport,
} from "@/lib/ga-word-bank";
import { listGaCategoryNamesForContext } from "@/lib/ga-categories";

const requestSchema = z.object({
  mode: z.enum(["preview", "commit"]),
  text: z.string(),
  duplicateStrategy: z.enum(["skip", "update"]).optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const body = requestSchema.parse(await request.json());
    const parsedRows = parseGaBulkImportText(body.text);

    const [sources, existingWords] = await Promise.all([
      listGaSources(),
      prisma.gaWord.findMany({
        select: { id: true, englishWord: true, gaWord: true, category: true, sourcePage: true },
      }),
    ]);
    const allowedCategories = await listGaCategoryNamesForContext("word_bank", "all");

    const preview = previewGaBulkImport(
      parsedRows,
      sources.map((source) => ({ id: source.id, sourceName: source.sourceName })),
      existingWords,
      { allowedCategories },
    );

    if (body.mode === "preview") {
      return NextResponse.json({
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        invalidRows: preview.invalidRows,
        duplicateWarnings: preview.duplicateWarnings,
        rows: preview.rows,
      });
    }

    if (preview.invalidRows > 0) {
      return NextResponse.json({
        error: "Fix invalid rows before importing.",
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        invalidRows: preview.invalidRows,
        duplicateWarnings: preview.duplicateWarnings,
        rows: preview.rows,
      }, { status: 400 });
    }

    const duplicateStrategy = body.duplicateStrategy ?? "skip";
    const plan = planGaBulkImportCommit(preview.validItems, duplicateStrategy);
  const sourceNameById = new Map(sources.map((source) => [source.id, source.sourceName]));
  const summary = buildGaBulkImportCommitSummary(preview, plan, duplicateStrategy, sourceNameById);

    await prisma.$transaction(async (tx) => {
      for (const item of preview.validItems) {
        if (item.duplicateExisting) {
          if (duplicateStrategy === "update" && item.existingWordId) {
            await tx.gaWord.update({
              where: { id: item.existingWordId },
              data: item.data,
            });
          }
          continue;
        }
        await tx.gaWord.create({ data: item.data });
      }
    }, {
      // Bulk imports can exceed the default interactive transaction timeout.
      timeout: 60000,
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_word.bulk_imported",
      entityType: "ga_word",
      entityId: "bulk",
      metadata: {
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        invalidRows: preview.invalidRows,
        duplicateWarnings: preview.duplicateWarnings,
        duplicateStrategy,
        created: plan.creates,
        updated: plan.updates,
        skipped: plan.skips,
      },
    });

    return NextResponse.json({
      totalRows: preview.totalRows,
      validRows: preview.validRows,
      invalidRows: preview.invalidRows,
      duplicateWarnings: preview.duplicateWarnings,
      duplicateStrategy,
      created: plan.creates,
      updated: plan.updates,
      skipped: plan.skips,
      summary,
    });
  } catch (error) {
    if (isGaWordSchemaNotReadyError(error)) {
      return NextResponse.json({ error: "Ga Word tables are not ready yet. Apply migrations to enable bulk import." }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process bulk import." }, { status: 400 });
  }
}
