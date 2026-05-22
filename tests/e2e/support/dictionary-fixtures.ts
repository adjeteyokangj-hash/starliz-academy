import dotenv from "dotenv";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

dotenv.config({ path: ".env.local", override: true });

export const E2E_DICTIONARY_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPS_ADMIN_EMAIL;
export const E2E_DICTIONARY_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPS_ADMIN_PASSWORD;

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

function ensureCredentials() {
  if (!E2E_DICTIONARY_ADMIN_EMAIL || !E2E_DICTIONARY_ADMIN_PASSWORD) {
    throw new Error("Dictionary E2E admin credentials are missing. Set E2E_ADMIN_* or E2E_OPS_ADMIN_* env vars.");
  }
}

async function loginRequest(request: APIRequestContext) {
  ensureCredentials();
  const response = await request.post("/api/auth/login", {
    data: {
      email: E2E_DICTIONARY_ADMIN_EMAIL,
      password: E2E_DICTIONARY_ADMIN_PASSWORD,
    },
    failOnStatusCode: false,
  });
  expect(response.ok(), `Expected admin login to succeed. status=${response.status()}`).toBeTruthy();
}

export async function ensureDictionaryAdminUser() {
  // Kept for backwards compatibility with existing specs. Login validation is enough.
}

export async function loginAsDictionaryAdmin(page: Page) {
  await loginRequest(page.request);
}

type DictionaryApiItem = {
  id: string;
  word: string;
  subject: string;
  keyStage: string;
  yearGroup: string | null;
};

export async function seedDeterministicDictionaryWords(request: APIRequestContext) {
  await loginRequest(request);

  const seeded = [
    {
      word: "bright",
      normalizedWord: normalizeWord("bright"),
      subject: "spelling",
      keyStage: "ks1",
      yearGroup: "Year 1",
      difficulty: "easy",
      definitionChild: "Bright means full of light.",
      exampleSentence: "The sun is bright.",
      active: true,
      isSpellingKeyword: true,
      interventionTags: ["phonics-refresh"],
      senTags: ["visual-support"],
      safeguardingTags: [],
      curriculumTags: ["spellings-year1"],
      synonyms: [],
      antonyms: [],
      relatedWords: [],
    },
    {
      word: "fraction",
      normalizedWord: normalizeWord("fraction"),
      subject: "maths",
      keyStage: "ks2",
      yearGroup: "Year 4",
      difficulty: "medium",
      definitionChild: "A fraction is a part of a whole.",
      exampleSentence: "One half is a fraction.",
      active: true,
      isMathsKeyword: true,
      interventionTags: [],
      senTags: [],
      safeguardingTags: [],
      curriculumTags: ["maths-fractions"],
      synonyms: [],
      antonyms: [],
      relatedWords: [],
    },
    {
      word: "retiredword",
      normalizedWord: normalizeWord("retiredword"),
      subject: "spelling",
      keyStage: "ks1",
      yearGroup: "Year 1",
      difficulty: "easy",
      definitionChild: "This word should not be returned for coach help.",
      exampleSentence: "Retiredword should stay hidden.",
      active: false,
      isSpellingKeyword: true,
      interventionTags: [],
      senTags: [],
      safeguardingTags: [],
      curriculumTags: ["hidden-word"],
      synonyms: [],
      antonyms: [],
      relatedWords: [],
    },
  ];

  for (const entry of seeded) {
    const query = new URLSearchParams({
      q: entry.word,
      subject: entry.subject,
      keyStage: entry.keyStage,
      yearGroup: entry.yearGroup,
      limit: "50",
    });

    const listResponse = await request.get(`/api/admin/dictionary?${query.toString()}`, {
      failOnStatusCode: false,
    });
    expect(listResponse.ok(), `Expected dictionary list query to succeed for ${entry.word}.`).toBeTruthy();

    const listPayload = (await listResponse.json()) as { items?: DictionaryApiItem[] };
    const existing = (listPayload.items ?? []).find((item) =>
      normalizeWord(item.word) === entry.normalizedWord
      && item.subject === entry.subject
      && item.keyStage === entry.keyStage
      && (item.yearGroup ?? null) === (entry.yearGroup ?? null),
    );

    if (existing) {
      const patchResponse = await request.patch(`/api/admin/dictionary/${existing.id}`, {
        data: entry,
        failOnStatusCode: false,
      });
      expect(
        patchResponse.ok(),
        `Expected dictionary update to succeed for ${entry.word}. status=${patchResponse.status()}`,
      ).toBeTruthy();
      continue;
    }

    const createResponse = await request.post("/api/admin/dictionary", {
      data: entry,
      failOnStatusCode: false,
    });
    expect(
      createResponse.ok(),
      `Expected dictionary create to succeed for ${entry.word}. status=${createResponse.status()}`,
    ).toBeTruthy();
  }
}
