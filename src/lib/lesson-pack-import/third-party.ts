import type { LessonPackUploadedFile, ThirdPartyFinding } from "@/lib/lesson-pack-import/types";
import { createHash } from "node:crypto";

type Rule = {
  item: string;
  riskReason: string;
  patterns: RegExp[];
};

const RULES: Rule[] = [
  {
    item: "Publisher logo / branding",
    riskReason: "Third-party branding — exclude from student-facing design",
    patterns: [/\blogo\b/i, /\btwinkl\b/i, /\bwhite\s+rose\b/i, /\bbbc\s+bitesize\b/i],
  },
  {
    item: "Oak branding",
    riskReason: "Oak branding detected — exclude from student-facing design",
    patterns: [/\boak\s+national\s+academy\b/i, /\boak\.org\b/i],
  },
  {
    item: "Book cover / published extract",
    riskReason: "Published text extracts and book covers are typically rights-restricted",
    // Only match genuine book-cover or extract-from references, not bare © which
    // appears in most educational PDFs as standard footer text.
    patterns: [/\bbook\s+cover\b/i, /\bextract\s+from\b/i, /\breproduced\s+with\s+permission\b/i],
  },
  {
    item: "Copyright notice",
    riskReason: "File contains a copyright notice — verify licence permits adaptation",
    // Only flag explicit "Copyright 20xx" or "© Publisher Name" patterns, not bare ©
    patterns: [/copyright\s+\d{4}/i, /©\s*\d{4}/i, /©\s*[A-Z][a-z]/],
  },
  {
    item: "Photograph",
    riskReason: "Photographs may be copyrighted third-party assets",
    patterns: [/\bphoto\s+credit\b/i, /\bstock\s+image\b/i, /\bshutterstock\b/i, /\bgetty\b/i],
  },
  {
    item: "Commercial illustration",
    riskReason: "Commercial illustrations must not be imported automatically",
    // "character" alone is too broad for literacy/English lessons — require "character"
    // adjacent to commercial art signals, not standalone curriculum usage
    patterns: [/\billustration\s+by\b/i, /\bcartoon\s+(character|image)\b/i, /\bmascot\b/i],
  },
  {
    item: "Map or chart asset",
    riskReason: "Maps and publisher charts may require a separate licence",
    patterns: [/\bmap\s+of\b/i, /\batlas\b/i, /\bchart\s+source\b/i],
  },
  {
    item: "Embedded external media",
    riskReason: "External media embeds must not be imported into the student lesson",
    patterns: [/\byoutube\.com\b/i, /\bvimeo\.com\b/i, /\biframe\b/i, /\bvideo\s+clip\b/i],
  },
];

export function detectThirdPartyMaterial(files: LessonPackUploadedFile[]): ThirdPartyFinding[] {
  const findings: ThirdPartyFinding[] = [];

  for (const file of files) {
    const corpus = [
      file.originalName,
      file.documentTitle ?? "",
      ...file.headings,
      file.textContent.slice(0, 8000),
    ].join("\n");

    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        if (!pattern.test(corpus)) continue;
        const id = createHash("sha1")
          .update(`${file.id}:${rule.item}:${pattern.source}`)
          .digest("hex")
          .slice(0, 12);
        findings.push({
          id: `tp_${id}`,
          fileId: file.id,
          fileName: file.originalName,
          pageOrSlide: file.pageOrSlideCount > 0 ? 1 : null,
          detectedItem: rule.item,
          riskReason: rule.riskReason,
          recommendedAction: "exclude",
          action: "exclude",
        });
        break;
      }
    }
  }

  // De-dupe by file + item
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.fileId}:${f.detectedItem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
