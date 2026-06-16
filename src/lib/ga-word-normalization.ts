function cleanValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

// Preserve Ga letters while matching duplicates case-insensitively.
export function normalizeWordForDuplicate(value: string | null | undefined): string {
  return cleanValue(value).toLocaleLowerCase("en-US");
}

export function isCaseInsensitiveWordDuplicate(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeWordForDuplicate(left) === normalizeWordForDuplicate(right);
}
