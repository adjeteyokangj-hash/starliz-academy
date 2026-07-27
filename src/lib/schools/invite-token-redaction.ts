/**
 * Pure helpers for invite-token redaction in SchoolAuditLog metadata.
 * Safe to import from tests without touching the database.
 */

const SENSITIVE_KEYS = new Set(["inviteToken", "newToken", "token", "rawToken", "inviteSecret"]);

export function redactInviteSecretsInMetadata(raw: string | null): {
  changed: boolean;
  next: string | null;
  fields: string[];
} {
  if (!raw) return { changed: false, next: null, fields: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { changed: false, next: raw, fields: [] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { changed: false, next: raw, fields: [] };
  }

  const obj = { ...(parsed as Record<string, unknown>) };
  const fields: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (
      SENSITIVE_KEYS.has(key)
      || (/token/i.test(key) && typeof value === "string" && !/expires/i.test(key) && value !== "[redacted]")
    ) {
      if (value !== "[redacted]") {
        obj[key] = "[redacted]";
        fields.push(key);
      }
      continue;
    }
    if (typeof value === "string" && /[?&]token=/i.test(value) && !value.includes("token=[redacted]")) {
      obj[key] = value.replace(/([?&]token=)[^&]+/gi, "$1[redacted]");
      fields.push(key);
    }
  }

  if (fields.length === 0) return { changed: false, next: raw, fields: [] };
  return { changed: true, next: JSON.stringify(obj), fields };
}
