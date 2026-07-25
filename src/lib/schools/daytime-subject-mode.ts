export type DaytimeSubjectMode =
  | "guided-reading"
  | "spelling"
  | "maths"
  | "science"
  | "practical-pe"
  | "practical-arts"
  | "practical-music"
  | "computing"
  | "humanities"
  | "generic-lesson";

export function classifyDaytimeSubjectMode(
  subject: string,
  skillFocus?: string | null,
): DaytimeSubjectMode {
  const s = `${subject} ${skillFocus ?? ""}`.toLowerCase();
  if (
    s.includes("guided reading")
    || (s.includes("reading") && (s.includes("guid") || s.includes("inference") || s.includes("comprehension")))
    || (s.includes("english") && s.includes("reading"))
    || (s.includes("intervention") && s.includes("reading"))
  ) {
    return "guided-reading";
  }
  if (s.includes("spell") || s.includes("phonic")) return "spelling";
  if (s.includes("math") || s.includes("numeracy") || s.includes("place value") || s.includes("number fluency")) {
    return "maths";
  }
  if (s.includes("science") || s.includes("enquiry") || s.includes("inquiry")) return "science";
  if (
    /\bpe\b/.test(s)
    || s.includes("physical education")
    || s.includes("invasion games")
    || s.includes("physical")
    || (s.includes("sport") && !s.includes("transport"))
  ) {
    return "practical-pe";
  }
  if (s.includes("art") || s.includes("design")) return "practical-arts";
  if (s.includes("music")) return "practical-music";
  if (s.includes("comput") || s.includes("ict") || s.includes("coding")) return "computing";
  if (s.includes("histor") || s.includes("geograph") || s.includes("humanit")) return "humanities";
  return "generic-lesson";
}

export function contentTypeForSubjectMode(mode: DaytimeSubjectMode): string {
  switch (mode) {
    case "maths":
      return "math";
    case "spelling":
      return "spelling";
    case "guided-reading":
    case "humanities":
    case "computing":
    case "generic-lesson":
      return "reading";
    case "science":
    case "practical-pe":
    case "practical-arts":
    case "practical-music":
      return "lesson";
    default:
      return "lesson";
  }
}
