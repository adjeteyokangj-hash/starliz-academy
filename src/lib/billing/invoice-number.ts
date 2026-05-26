import crypto from "crypto";

function twoDigit(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildInvoicePrefix(region: string): string {
  const normalized = region.trim().toUpperCase();
  return normalized === "GH" ? "SL-GH" : "SL-UK";
}

export function generateInvoiceNumber(input: {
  region: string;
  now?: Date;
  paymentReference?: string | null;
}): string {
  const now = input.now ?? new Date();
  const prefix = buildInvoicePrefix(input.region);
  const year = now.getUTCFullYear();
  const month = twoDigit(now.getUTCMonth() + 1);
  const day = twoDigit(now.getUTCDate());
  const seed = `${input.paymentReference ?? "no-ref"}:${now.getTime()}:${Math.random()}`;
  const suffix = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 6).toUpperCase();
  return `${prefix}-${year}${month}${day}-${suffix}`;
}

export function buildIdempotencyKey(parts: Array<string | null | undefined>): string {
  const normalized = parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join("|");
  return crypto.createHash("sha256").update(normalized || "fallback").digest("hex");
}
