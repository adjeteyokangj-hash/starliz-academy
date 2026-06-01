const SENSITIVE_KEYWORDS = [
  "password",
  "token",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "set-cookie",
  "email",
  "phone",
  "child",
  "student",
  "parent",
];

function maskValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return value.length <= 6 ? "[REDACTED]" : `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  return "[REDACTED]";
}

export function redactSensitiveLogData(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    const shouldRedact = SENSITIVE_KEYWORDS.some((keyword) => lowerKey.includes(keyword));

    if (shouldRedact) {
      result[key] = maskValue(value);
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactSensitiveLogData(value as Record<string, unknown>);
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.map((entry) => {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          return redactSensitiveLogData(entry as Record<string, unknown>);
        }
        return entry;
      });
      continue;
    }

    result[key] = value;
  }

  return result;
}
