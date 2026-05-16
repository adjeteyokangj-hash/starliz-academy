/**
 * Content validation for subject and type safety.
 * Ensures that content loaded in a specific game route matches the expected subject.
 */

export type ContentSubject = "math" | "maths" | "spelling" | "reading";

function normalizeSubject(subject: unknown): ContentSubject | null {
  if (typeof subject !== "string") return null;
  const normalized = subject.toLowerCase().trim();
  if (normalized === "math" || normalized === "maths") return "math";
  if (normalized === "spelling") return "spelling";
  if (normalized === "reading") return "reading";
  return null;
}

export function validateContentSubject(
  contentSubject: unknown,
  expectedSubject: ContentSubject,
): { valid: boolean; error?: string } {
  const normalized = normalizeSubject(contentSubject);
  if (!normalized) {
    return {
      valid: false,
      error: `Content has invalid or missing subject metadata: "${String(contentSubject)}"`,
    };
  }

  // Math and maths are interchangeable
  if (expectedSubject === "math" && (normalized === "math" || normalized === "maths")) {
    return { valid: true };
  }

  if (normalized === expectedSubject) {
    return { valid: true };
  }

  // Mismatch: content subject does not match route
  return {
    valid: false,
    error: `This activity is for ${normalized}, not ${expectedSubject}. Please return to your dashboard to select the correct activity.`,
  };
}

/**
 * Validate a single content item for subject correctness.
 * Used before displaying content to the user.
 */
export function validateContentItem(
  item: Record<string, unknown> | null | undefined,
  expectedSubject: ContentSubject,
): { valid: boolean; error?: string } {
  if (!item || typeof item !== "object") {
    return { valid: false, error: "Content is missing or corrupted." };
  }

  // Check for explicit subject field
  const subject = item.subject ?? item.contentType ?? item.type;
  return validateContentSubject(subject, expectedSubject);
}

/**
 * Validate an entire content batch before processing.
 * Returns the first validation error if any item fails.
 */
export function validateContentBatch(
  items: unknown[],
  expectedSubject: ContentSubject,
): { valid: boolean; error?: string; invalidItemCount?: number } {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: "No content items to load." };
  }

  let invalidCount = 0;
  for (const item of items) {
    const validation = validateContentItem(item as Record<string, unknown>, expectedSubject);
    if (!validation.valid) {
      invalidCount++;
      // Return first error for user feedback
      if (invalidCount === 1) {
        return {
          valid: false,
          error: validation.error,
          invalidItemCount: invalidCount,
        };
      }
    }
  }

  if (invalidCount > 0) {
    return {
      valid: false,
      error: `${invalidCount} content item(s) do not match ${expectedSubject}. Please refresh or contact your parent/teacher.`,
      invalidItemCount: invalidCount,
    };
  }

  return { valid: true };
}
