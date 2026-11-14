export function normalizeDictionaryWord(word: string): string {
  return String(word ?? "").trim().toLowerCase();
}
