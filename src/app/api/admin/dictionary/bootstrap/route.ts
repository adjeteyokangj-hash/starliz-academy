import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { createDictionaryWord, recordDictionaryBulkImport } from "@/lib/dictionary";
import { getAllDictionaryBootstrapWords } from "@/lib/dictionarySeedBootstrap";

export async function POST() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const source = "bootstrap:starter";
  const seedWords = getAllDictionaryBootstrapWords();

  let addedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const word of seedWords) {
    try {
      await createDictionaryWord(
        {
          ...word,
          synonyms: word.synonyms ?? [],
          antonyms: word.antonyms ?? [],
          relatedWords: word.relatedWords ?? [],
          interventionTags: word.interventionTags ?? [],
          senTags: word.senTags ?? [],
          safeguardingTags: word.safeguardingTags ?? [],
          curriculumTags: word.curriculumTags ?? [],
          importSource: source,
        },
        { actorUserId: session.userId, importSource: source },
      );
      addedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Duplicate dictionary word")) {
        skippedCount += 1;
      } else {
        failedCount += 1;
      }
    }
  }

  await recordDictionaryBulkImport({
    source,
    initiatedByUserId: session.userId,
    addedCount,
    skippedCount,
    failedCount,
    metadata: { requestedCount: seedWords.length },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "dictionary.bulk_import",
    entityType: "dictionary_word",
    metadata: {
      source,
      requestedCount: seedWords.length,
      addedCount,
      skippedCount,
      failedCount,
    },
  });

  return NextResponse.json({ source, requestedCount: seedWords.length, addedCount, skippedCount, failedCount });
}
