#!/usr/bin/env node
/**
 * Seed: Ga Pronunciation References
 *
 * Populates GaPronunciationReference rows for:
 *   1. General Ga language phonology guides (web pages)
 *   2. Each Ga special vowel (ɔ, ɛ, ɔ̃, ɛ̃, ŋ) with a pronunciation note
 *   3. Key Ga consonant clusters (gb, kp, ŋm, ny, ts, sh, tsw, hw)
 *   4. YouTube reference channel (REFERENCE_ONLY permission)
 *   5. Community pronunciation pages (Forvo)
 *   6. Key Foundation-level phrases
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed_ga_pronunciation_references.mjs
 *
 * Safe to re-run: skips any reference with the same (sourceUrl, linkedLetter,
 * linkedSound, linkedPhraseText) combination.
 *
 * NOTE: YouTube sources are stored as REFERENCE_ONLY (no download / embedding
 * rights). All other web sources default to REFERENCE_ONLY as well until an
 * admin confirms a licensing arrangement.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, "../.env.local");
  try {
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let val = trimmed.slice(eqIndex + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
    console.log("Loaded .env.local");
  } catch {
    console.warn("Could not load .env.local — ensure DATABASE_URL is set.");
  }
}

const prisma = new PrismaClient();

/**
 * @typedef {{
 *   referenceType: string;
 *   sourceUrl: string;
 *   sourceTitle?: string;
 *   channelName?: string;
 *   speakerName?: string;
 *   linkedLetter?: string;
 *   linkedSound?: string;
 *   linkedPhraseText?: string;
 *   pronunciationNote?: string;
 *   permissionStatus?: string;
 *   reviewStatus?: string;
 *   confidenceLevel?: number;
 * }} ReferenceEntry
 */

/** @type {ReferenceEntry[]} */
const REFERENCES = [

  // ─── General Ga Language Guides ─────────────────────────────────────────

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language, alphabet and pronunciation — Omniglot",
    pronunciationNote:
      "Overview of the Ga alphabet, vowels, consonants and tone system. " +
      "Useful starting point for understanding Ga phonology.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

  {
    referenceType: "DICTIONARY_WEB",
    sourceUrl: "https://kasahorow.com/read/ga/dictionary",
    sourceTitle: "Kasahorow Ga–English Online Dictionary",
    pronunciationNote:
      "Primary dictionary source used for the Ga word bank. " +
      "Contains Ga words with English translations for children.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 90,
  },

  {
    referenceType: "COMMUNITY_PRONUNCIATION",
    sourceUrl: "https://forvo.com/languages/gaa/",
    sourceTitle: "Ga (Gaa) Pronunciation Guide — Forvo",
    pronunciationNote:
      "Community-contributed audio pronunciations of Ga words by native speakers. " +
      "Use to verify individual word pronunciations.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 75,
  },

  {
    referenceType: "NLP_RESOURCE",
    sourceUrl: "https://ghananlp.org",
    sourceTitle: "GhanaNLP — Natural Language Processing for Ghanaian Languages",
    pronunciationNote:
      "Research and language technology resources for Ga and other Ghanaian languages, " +
      "including text-to-speech and audio datasets.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 70,
  },

  {
    referenceType: "YOUTUBE_CHANNEL",
    sourceUrl: "https://www.youtube.com/@kasahorow",
    sourceTitle: "Kasahorow YouTube Channel",
    channelName: "Kasahorow",
    pronunciationNote:
      "Kasahorow's official YouTube channel with Ga language learning videos, " +
      "alphabet songs and children's content.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

  {
    referenceType: "TTS_REFERENCE",
    sourceUrl: "https://translate.google.com/?sl=gaa&tl=en",
    sourceTitle: "Google Translate — Ga (Gaa) Text-to-Speech",
    pronunciationNote:
      "Google Translate offers text-to-speech for Ga (language code: gaa). " +
      "Useful for rough pronunciation guidance; accuracy should be verified by a native speaker.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 60,
  },

  // ─── Special Ga Vowels ──────────────────────────────────────────────────

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedLetter: "ɔ",
    pronunciationNote:
      "The Ga vowel ɔ (open-o) is pronounced like the 'o' in British English 'hot' or 'lot' — " +
      "an open back rounded vowel. It is distinct from the closed 'o' in 'go'. " +
      "Example Ga words: ɔkɛ (sky), nyɔŋ (food/thing).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 85,
  },

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedLetter: "ɛ",
    pronunciationNote:
      "The Ga vowel ɛ (open-e) is pronounced like the 'e' in 'bed' or 'get' — " +
      "an open-mid front unrounded vowel. It is distinct from the closed 'e' in 'they'. " +
      "Example Ga words: lɛ (play), hwɛ (see/look).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 85,
  },

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedLetter: "ŋ",
    pronunciationNote:
      "The Ga letter ŋ is a velar nasal, the same sound as 'ng' at the end of 'sing' or 'ring'. " +
      "In Ga it can appear at the start of words, which is unusual for English speakers. " +
      "Practice: say 'singing' then drop the 'si-' to produce a standalone ŋ sound.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 85,
  },

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedSound: "ŋm",
    pronunciationNote:
      "The Ga sound ŋm is a bilabial-velar nasal — a nasal produced simultaneously " +
      "at the back of the mouth (velar, like ŋ) and at the lips (bilabial, like m). " +
      "It is unique to West African languages. Start with 'ng' and close your lips at the same time. " +
      "Example: ŋmene (today).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

  // ─── Special Ga Consonant Clusters ──────────────────────────────────────

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedSound: "gb",
    pronunciationNote:
      "The Ga sound gb is a voiced bilabial-velar stop — 'g' and 'b' are pronounced " +
      "simultaneously, not in sequence. Common in West African languages. " +
      "Practise by trying to say 'g' and 'b' at exactly the same time. " +
      "Example Ga words: gbekenuu (boy), gbee (dog).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedSound: "kp",
    pronunciationNote:
      "The Ga sound kp is a voiceless bilabial-velar stop — 'k' and 'p' are produced " +
      "at the same instant, not in sequence. Think of it as a single sound " +
      "articulated at the back of the mouth and at the lips simultaneously. " +
      "Example Ga words: kpaklo (egg), kpakpo (fish).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedSound: "ny",
    pronunciationNote:
      "The Ga sound ny is a palatal nasal — the same sound as 'ny' in 'canyon' or " +
      "the Spanish letter ñ. In Ga it appears in word-initial position. " +
      "Example: nyɔŋ (thing/stuff), Nye (yesterday).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 85,
  },

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedSound: "ts",
    pronunciationNote:
      "The Ga sound ts is an affricate — similar to 'ts' in 'cats' or 'bits'. " +
      "In Ga it is a single sound unit and can appear at the start of a word. " +
      "Example: tse (father), tsu (sit).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedSound: "sh",
    pronunciationNote:
      "The Ga sound sh is like the 'sh' in English 'ship' or 'show'. " +
      "Example: Shɔ (Wednesday).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 90,
  },

  {
    referenceType: "PHONOLOGY_GUIDE",
    sourceUrl: "https://omniglot.com/writing/ga.htm",
    sourceTitle: "Ga language phonology — Omniglot",
    linkedSound: "hw",
    pronunciationNote:
      "The Ga sound hw is an aspirated or voiceless labial-velar approximant — " +
      "similar to the 'wh' in some pronunciations of 'what' or 'where'. " +
      "Produce a strong puff of air while forming a 'w' shape with the lips. " +
      "Example: hwɛ (see/look).",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 75,
  },

  // ─── Key Foundation Phrases ──────────────────────────────────────────────

  {
    referenceType: "DICTIONARY_WEB",
    sourceUrl: "https://kasahorow.com/read/ga/dictionary",
    sourceTitle: "Kasahorow Ga Dictionary — Greetings",
    linkedPhraseText: "Ojekoo",
    pronunciationNote:
      "Ojekoo = 'Thank you' in Ga. Pronounced oh-jeh-KOH. " +
      "The stress falls on the final syllable. It is one of the most important " +
      "everyday expressions in Ga.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 85,
  },

  {
    referenceType: "DICTIONARY_WEB",
    sourceUrl: "https://kasahorow.com/read/ga/dictionary",
    sourceTitle: "Kasahorow Ga Dictionary — Greetings",
    linkedPhraseText: "Maa leebi",
    pronunciationNote:
      "Maa leebi = 'Good morning' in Ga. Pronounced MAH-ah LEH-bee. " +
      "'Leebi' means morning. A respectful morning greeting used across all ages.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

  {
    referenceType: "DICTIONARY_WEB",
    sourceUrl: "https://kasahorow.com/read/ga/dictionary",
    sourceTitle: "Kasahorow Ga Dictionary — Greetings",
    linkedPhraseText: "Ko nyɔŋ",
    pronunciationNote:
      "Ko nyɔŋ = 'Goodbye' in Ga, literally 'go well/safely'. " +
      "Pronounced KOH nyawng. The ɔ is an open-o vowel (like British 'hot').",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

  {
    referenceType: "DICTIONARY_WEB",
    sourceUrl: "https://kasahorow.com/read/ga/dictionary",
    sourceTitle: "Kasahorow Ga Dictionary — Greetings",
    linkedPhraseText: "Kafra",
    pronunciationNote:
      "Kafra = 'Sorry / Excuse me' in Ga. Pronounced KAH-frah. " +
      "Used both as an apology and to politely attract attention.",
    permissionStatus: "REFERENCE_ONLY",
    reviewStatus: "DRAFT",
    confidenceLevel: 80,
  },

];

try {
  let inserted = 0;
  let skipped = 0;

  for (const ref of REFERENCES) {
    // Dedup key: sourceUrl + linkedLetter + linkedSound + linkedPhraseText
    const existing = await prisma.gaPronunciationReference.findFirst({
      where: {
        sourceUrl: ref.sourceUrl,
        linkedLetter: ref.linkedLetter ?? null,
        linkedSound: ref.linkedSound ?? null,
        linkedPhraseText: ref.linkedPhraseText ?? null,
      },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      const tag =
        ref.linkedLetter ??
        ref.linkedSound ??
        ref.linkedPhraseText ??
        ref.referenceType;
      console.log(`  skipped (exists): ${tag} — ${ref.sourceUrl}`);
      continue;
    }

    await prisma.gaPronunciationReference.create({
      data: {
        referenceType: ref.referenceType,
        sourceUrl: ref.sourceUrl,
        sourceTitle: ref.sourceTitle ?? null,
        channelName: ref.channelName ?? null,
        speakerName: ref.speakerName ?? null,
        linkedLetter: ref.linkedLetter ?? null,
        linkedSound: ref.linkedSound ?? null,
        linkedPhraseText: ref.linkedPhraseText ?? null,
        pronunciationNote: ref.pronunciationNote ?? null,
        permissionStatus: ref.permissionStatus ?? "REFERENCE_ONLY",
        reviewStatus: ref.reviewStatus ?? "DRAFT",
        confidenceLevel: ref.confidenceLevel ?? null,
      },
    });
    inserted += 1;
    const tag =
      ref.linkedLetter ??
      ref.linkedSound ??
      ref.linkedPhraseText ??
      ref.referenceType;
    console.log(`  created: ${tag} — ${ref.sourceUrl}`);
  }

  console.log("");
  console.log(`Inserted : ${inserted}`);
  console.log(`Skipped  : ${skipped} (already existed)`);
  console.log("");
  console.log("All pronunciation references are stored with reviewStatus=DRAFT.");
  console.log("Visit Admin → Ga Voice to review and approve references.");
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
