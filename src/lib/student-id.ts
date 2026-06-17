export function formatStudentId(value: string | null | undefined): string {
  const normalized = String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalized) return "STU-UNKNOWN";
  return `STU-${normalized.slice(0, 8)}`;
}

export function studentIdMatchesQuery(value: string | null | undefined, query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  if (!normalizedQuery) return true;

  const raw = String(value ?? "").toUpperCase();
  const formatted = formatStudentId(value);
  return raw.includes(normalizedQuery) || formatted.includes(normalizedQuery);
}