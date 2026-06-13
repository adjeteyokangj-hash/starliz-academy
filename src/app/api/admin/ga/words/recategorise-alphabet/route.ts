import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { recategorizeGaAlphabetRowsFromGrammar } from "@/lib/ga-word-bank";

// Transitional maintenance endpoint for legacy data cleanup only.
// It fixes old rows that were historically saved as Grammar but should be Alphabet.
// Category runtime authority remains DB-managed admin categories.
export async function POST() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  try {
    const result = await recategorizeGaAlphabetRowsFromGrammar();
    await writeAuditLog({
      actorUserId: session.userId,
      action: "ga_word.recategorise_alphabet",
      entityType: "ga_word",
      entityId: "alphabet-bulk",
      metadata: result,
    });

    return NextResponse.json({
      message: result.updated
        ? `Legacy cleanup complete: recategorised ${result.updated} Grammar alphabet row${result.updated === 1 ? "" : "s"} to Alphabet.`
        : "Legacy cleanup: no Grammar alphabet rows were eligible for recategorisation.",
      maintenanceOnly: true,
      intent: "legacy_grammar_to_alphabet_cleanup",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to recategorise alphabet rows." },
      { status: 400 },
    );
  }
}
