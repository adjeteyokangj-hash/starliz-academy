import { extractZipEntries } from "@/lib/lesson-pack-import/zip-extract";
import type { LessonPackFileKind } from "@/lib/lesson-pack-import/types";

export type ExtractedDocument = {
  text: string;
  documentTitle: string | null;
  headings: string[];
  pageOrSlideCount: number;
  metadata: Record<string, string>;
  status: "ok" | "partial" | "failed";
  error?: string;
  isPasswordProtected?: boolean;
  isScannedImageOnly?: boolean;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function extractXmlTagTexts(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, "gi");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const text = decodeXmlEntities(match[1]).trim();
    if (text) out.push(text);
  }
  return out;
}

function extractHeadingsFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && line.length <= 120)
    .filter((line) => /^(year\s+\d+|lesson|objective|starter|exit|worksheet|learning|warm.?up|plenary)/i.test(line) || /^[A-Z][A-Za-z0-9 ,:'-]{2,80}$/.test(line))
    .slice(0, 40);
}

export function extractPdfText(bytes: Buffer): ExtractedDocument {
  const latin = bytes.toString("latin1");
  if (/\/Encrypt\b/.test(latin)) {
    return {
      text: "",
      documentTitle: null,
      headings: [],
      pageOrSlideCount: 0,
      metadata: {},
      status: "failed",
      error: "Password-protected PDF",
      isPasswordProtected: true,
    };
  }

  const titleMatch = latin.match(/\/Title\s*\(([^)]*)\)/);
  const documentTitle = titleMatch ? decodePdfLiteral(titleMatch[1]) : null;

  const pageMatches = latin.match(/\/Type\s*\/Page\b/g);
  const pageOrSlideCount = pageMatches?.length ?? 0;

  const chunks: string[] = [];
  // Literal strings inside content streams
  const literalRe = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = literalRe.exec(latin))) {
    const decoded = decodePdfLiteral(match[0].slice(1, -1));
    if (decoded.trim().length >= 2 && /[A-Za-z0-9]/.test(decoded)) {
      chunks.push(decoded);
    }
  }

  // Tj / TJ operators often follow literals — keep unique-ish flow
  const text = cleanupExtractedText(chunks.join(" "));
  const imageHeavy = /\/Subtype\s*\/Image\b/i.test(latin) && text.replace(/\s+/g, "").length < 40;

  if (!text) {
    return {
      text: "",
      documentTitle,
      headings: [],
      pageOrSlideCount,
      metadata: {},
      status: imageHeavy ? "failed" : "partial",
      error: imageHeavy ? "Scanned-image-only PDF (no extractable text)" : "Could not extract text from PDF",
      isScannedImageOnly: imageHeavy,
    };
  }

  return {
    text,
    documentTitle,
    headings: extractHeadingsFromText(text),
    pageOrSlideCount: Math.max(pageOrSlideCount, 1),
    metadata: documentTitle ? { title: documentTitle } : {},
    status: "ok",
    isScannedImageOnly: false,
  };
}

/** Decode UTF-16BE bytes. Node BufferEncoding does not include "utf16be". */
function decodeUtf16Be(bytes: Buffer): string {
  return new TextDecoder("utf-16be").decode(bytes).replace(/\u0000/g, "").trim();
}

function isReadableDecoded(decoded: string): boolean {
  return Boolean(decoded && (decoded.match(/[A-Za-z]/g) ?? []).length > decoded.length * 0.3);
}

function decodePdfLiteral(raw: string): string {
  const unescaped = raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));

  // PDF UTF-16BE string marker (BOM U+FEFF) often appears as "þÿ" in latin1.
  if (unescaped.startsWith("\u00fe\u00ff") || unescaped.startsWith("þÿ")) {
    const body = unescaped.slice(2);
    const bytes = Buffer.from(body, "latin1");
    try {
      const decoded = decodeUtf16Be(bytes);
      if (isReadableDecoded(decoded)) return decoded;
    } catch {
      // fall through
    }
    return body.replace(/\u0000/g, "").trim();
  }

  // Detect mid-string UTF-16BE sequences (null byte interleaving)
  if (unescaped.includes("\u0000")) {
    const bytes = Buffer.from(unescaped, "latin1");
    const nullCount = [...unescaped].filter((c) => c === "\u0000").length;
    // If roughly half the bytes are null, likely UTF-16BE
    if (nullCount > unescaped.length * 0.3) {
      try {
        const decoded = decodeUtf16Be(bytes);
        if (isReadableDecoded(decoded)) return decoded;
      } catch {
        // fall through
      }
    }
    return unescaped.replace(/\u0000/g, "").trim();
  }
  return unescaped;
}

function cleanupExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, " ")
    .replace(/þÿ/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractDocxText(bytes: Buffer): ExtractedDocument {
  try {
    const entries = extractZipEntries(bytes);
    const doc = entries.find((e) => e.path === "word/document.xml");
    if (!doc) {
      return { text: "", documentTitle: null, headings: [], pageOrSlideCount: 0, metadata: {}, status: "failed", error: "Invalid DOCX (missing document.xml)" };
    }
    const xml = doc.data.toString("utf8");
    const texts = extractXmlTagTexts(xml, "w:t");
    const text = cleanupExtractedText(texts.join(" "));
    const core = entries.find((e) => e.path === "docProps/core.xml");
    let documentTitle: string | null = null;
    const metadata: Record<string, string> = {};
    if (core) {
      const coreXml = core.data.toString("utf8");
      const titles = extractXmlTagTexts(coreXml, "dc:title");
      if (titles[0]) {
        documentTitle = titles[0];
        metadata.title = titles[0];
      }
    }
    return {
      text,
      documentTitle,
      headings: extractHeadingsFromText(text),
      pageOrSlideCount: Math.max(1, (xml.match(/<w:p[\s>]/g) ?? []).length),
      metadata,
      status: text ? "ok" : "partial",
      error: text ? undefined : "DOCX contained no readable text",
    };
  } catch (error) {
    return {
      text: "",
      documentTitle: null,
      headings: [],
      pageOrSlideCount: 0,
      metadata: {},
      status: "failed",
      error: error instanceof Error ? error.message : "Corrupt DOCX",
    };
  }
}


/** Approximate PPTX reading order: top-to-bottom, then left-to-right by shape transform. */
export function extractPptxSlideTextsInReadingOrder(xml: string): string[] {
  const shapes: Array<{ x: number; y: number; texts: string[] }> = [];
  const spRegex = /<(?:p:sp|p:graphicFrame|p:pic)\b[\s\S]*?<\/(?:p:sp|p:graphicFrame|p:pic)>/gi;
  let match: RegExpExecArray | null;
  while ((match = spRegex.exec(xml)) !== null) {
    const block = match[0];
    const off = block.match(/<a:off[^>]*>/i);
    let x = 0;
    let y = 0;
    if (off) {
      const xv = off[0].match(/\bx="(\d+)"/i);
      const yv = off[0].match(/\by="(\d+)"/i);
      x = xv ? Number(xv[1]) : 0;
      y = yv ? Number(yv[1]) : 0;
    }
    const texts = extractXmlTagTexts(block, "a:t");
    if (!texts.length) continue;
    shapes.push({ x, y, texts });
  }
  if (shapes.length < 2) return [];
  shapes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return shapes.flatMap((s) => s.texts);
}
export function extractPptxText(bytes: Buffer): ExtractedDocument {
  try {
    const entries = extractZipEntries(bytes);
    const slides = entries
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.path))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

    if (!slides.length) {
      return { text: "", documentTitle: null, headings: [], pageOrSlideCount: 0, metadata: {}, status: "failed", error: "Invalid PPTX (no slides)" };
    }

    const slideTexts: string[] = [];
    const headings: string[] = [];
    for (const slide of slides) {
      const xml = slide.data.toString("utf8");
      // Keep XML paragraph order for extraction stability (Oak worksheets).
      // Positional ordering is available via extractPptxSlideTextsInReadingOrder for layout-aware callers.
      const texts = extractXmlTagTexts(xml, "a:t");
      const joined = cleanupExtractedText(texts.join(" "));
      if (joined) {
        slideTexts.push(joined);
        if (texts[0]) headings.push(texts[0].slice(0, 120));
      }
    }

    const core = entries.find((e) => e.path === "docProps/core.xml");
    let documentTitle: string | null = null;
    const metadata: Record<string, string> = {};
    if (core) {
      const titles = extractXmlTagTexts(core.data.toString("utf8"), "dc:title");
      if (titles[0]) {
        documentTitle = titles[0];
        metadata.title = titles[0];
      }
    }

    const text = cleanupExtractedText(slideTexts.join("\n\n"));
    return {
      text,
      documentTitle,
      headings: headings.length ? headings.slice(0, 40) : extractHeadingsFromText(text),
      pageOrSlideCount: slides.length,
      metadata,
      status: text ? "ok" : "partial",
      error: text ? undefined : "PPTX contained no readable text",
    };
  } catch (error) {
    return {
      text: "",
      documentTitle: null,
      headings: [],
      pageOrSlideCount: 0,
      metadata: {},
      status: "failed",
      error: error instanceof Error ? error.message : "Corrupt PowerPoint",
    };
  }
}

export function extractPlainText(bytes: Buffer): ExtractedDocument {
  const text = cleanupExtractedText(bytes.toString("utf8"));
  return {
    text,
    documentTitle: null,
    headings: extractHeadingsFromText(text),
    pageOrSlideCount: 1,
    metadata: {},
    status: text ? "ok" : "failed",
    error: text ? undefined : "Empty text file",
  };
}

export function extractDocumentText(kind: LessonPackFileKind, bytes: Buffer): ExtractedDocument {
  switch (kind) {
    case "pdf":
      return extractPdfText(bytes);
    case "docx":
      return extractDocxText(bytes);
    case "pptx":
      return extractPptxText(bytes);
    case "txt":
      return extractPlainText(bytes);
    case "doc":
      return {
        text: "",
        documentTitle: null,
        headings: [],
        pageOrSlideCount: 0,
        metadata: {},
        status: "failed",
        error: "Legacy .doc format is not supported. Convert to .docx or PDF.",
      };
    case "zip":
      return {
        text: "",
        documentTitle: null,
        headings: [],
        pageOrSlideCount: 0,
        metadata: {},
        status: "failed",
        error: "ZIP containers are expanded before extraction",
      };
    default:
      return {
        text: "",
        documentTitle: null,
        headings: [],
        pageOrSlideCount: 0,
        metadata: {},
        status: "failed",
        error: "Unsupported format",
      };
  }
}
