/** Subject / lesson-type glyphs for student school-day surfaces. */

export type SubjectGlyph = {
  glyph: string;
  shortLabel: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Map lessonType / subject to a scannable glyph + short label.
 * Prefer lessonType for schedule kinds (break, registration); otherwise subject.
 */
export function subjectGlyph(input: {
  lessonType?: string | null;
  subject?: string | null;
  title?: string | null;
}): SubjectGlyph {
  const type = normalize(input.lessonType ?? "");
  const subject = normalize(input.subject ?? "");
  const title = normalize(input.title ?? "");
  const hay = `${type} ${subject} ${title}`;

  if (type === "break" || hay.includes("break")) {
    return { glyph: "☕", shortLabel: "Break" };
  }
  if (type === "lunch" || hay.includes("lunch")) {
    return { glyph: "🍽️", shortLabel: "Lunch" };
  }
  if (type === "registration" || hay.includes("registration") || hay.includes("register")) {
    return { glyph: "📋", shortLabel: "Registration" };
  }
  if (hay.includes("guided reading") || (hay.includes("reading") && !hay.includes("spell"))) {
    return { glyph: "📖", shortLabel: "Guided Reading" };
  }
  if (hay.includes("spell") || hay.includes("phonic")) {
    return { glyph: "🔤", shortLabel: "Spelling" };
  }
  if (hay.includes("math") || hay.includes("numeracy")) {
    return { glyph: "➗", shortLabel: "Maths" };
  }
  if (hay.includes("science") || hay.includes("stem")) {
    return { glyph: "🧪", shortLabel: "Science" };
  }
  if (
    type === "pe"
    || hay.includes(" physical")
    || hay.startsWith("pe ")
    || hay.includes(" pe")
    || subject === "pe"
    || hay.includes("sport")
  ) {
    return { glyph: "🏃", shortLabel: "PE" };
  }
  if (hay.includes("intervention") || hay.includes("catch") || hay.includes("support lesson")) {
    return { glyph: "🎯", shortLabel: "Intervention" };
  }
  if (hay.includes("english") || hay.includes("literacy") || hay.includes("writing")) {
    return { glyph: "✍️", shortLabel: "English" };
  }
  if (hay.includes("history")) {
    return { glyph: "🏛️", shortLabel: "History" };
  }
  if (hay.includes("geography")) {
    return { glyph: "🌍", shortLabel: "Geography" };
  }
  if (hay.includes("art") || hay.includes("music") || hay.includes("drama")) {
    return { glyph: "🎨", shortLabel: "Arts" };
  }
  if (hay.includes("computing") || hay.includes("coding") || hay.includes("ict")) {
    return { glyph: "💻", shortLabel: "Computing" };
  }

  const fallback =
    (input.subject && input.subject.trim())
    || (input.title && input.title.trim())
    || "Lesson";
  return { glyph: "📚", shortLabel: fallback };
}
