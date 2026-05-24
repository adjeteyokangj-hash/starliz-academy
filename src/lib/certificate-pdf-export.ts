import type { IssuedCertificateType } from "@/lib/certificate-issuing";

export type CertificateExportStatus = string;

export type CertificateExportInput = {
  title: string;
  studentDisplayName: string;
  certificateType: IssuedCertificateType;
  typeLabel: string;
  yearGroup: string | null;
  keyStage: string | null;
  term: string;
  subject: string | null;
  strand: string | null;
  awardType: string | null;
  awardScope: string | null;
  issuedAt: string;
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  status: CertificateExportStatus;
  score?: number | null;
  evidenceSummaryText?: string | null;
};

export type CertificateExportPayload = {
  issuer: "StarLiz Academy";
  issuerSubline: "By Okang Group";
  title: string;
  studentDisplayName: string;
  certificateType: IssuedCertificateType;
  typeLabel: string;
  subject: string | null;
  strand: string | null;
  awardType: string | null;
  awardScope: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  term: string;
  issuedDateLabel: string;
  issuedAt: string;
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  status: "issued" | "valid";
  verificationBadgeLabel: "Verified Certificate";
  qrPlaceholderLabel: "Scan or visit verification link";
  signaturePlaceholder: "Academic Office Placeholder";
  verificationNote: string;
  score: number | null;
  evidenceSummaryText: string | null;
};

export type CertificateExportResult =
  | { ok: true; payload: CertificateExportPayload }
  | { ok: false; code: "not_found" | "blocked" | "malformed"; message: string };

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
}

function titleCaseToken(value: string | null): string | null {
  if (!value) return null;
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(/\s+/g)
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : part))
    .join(" ");
}

function normalizeSubjectAndStrand(input: CertificateExportInput): { subject: string | null; strand: string | null } {
  if (input.certificateType !== "english_achievement") {
    return {
      subject: input.subject ? titleCaseToken(input.subject) : null,
      strand: input.strand ? titleCaseToken(input.strand) : null,
    };
  }

  return {
    subject: "English",
    strand: input.strand ? titleCaseToken(input.strand) : null,
  };
}

export function certificateTypeLabel(type: IssuedCertificateType): string {
  if (type === "term_completion") return "Term Certificate";
  if (type === "end_of_term_exam") return "Term Exam Certificate";
  if (type === "subject_achievement") return "Subject Certificate";
  if (type === "english_achievement") return "English Certificate";
  if (type === "mastery_certificate") return "Mastery Certificate";
  return "Award Certificate";
}

export function buildCertificateExportPayload(input: CertificateExportInput | null | undefined): CertificateExportResult {
  if (!input) {
    return { ok: false, code: "not_found", message: "Certificate not found." };
  }

  if (!input.certificateNumber || !input.verificationCode || !input.title || !input.term) {
    return {
      ok: false,
      code: "malformed",
      message: "Certificate export failed because certificate data is incomplete.",
    };
  }

  if (input.status === "revoked") {
    return {
      ok: false,
      code: "blocked",
      message: "Certificate PDF cannot be downloaded because this certificate has been revoked.",
    };
  }

  if (input.status !== "issued" && input.status !== "valid") {
    return {
      ok: false,
      code: "blocked",
      message: "Certificate PDF cannot be downloaded because the certificate has not been issued yet.",
    };
  }

  const normalized = normalizeSubjectAndStrand(input);

  return {
    ok: true,
    payload: {
      issuer: "StarLiz Academy",
      issuerSubline: "By Okang Group",
      title: input.title,
      studentDisplayName: input.studentDisplayName || "Learner",
      certificateType: input.certificateType,
      typeLabel: input.typeLabel || certificateTypeLabel(input.certificateType),
      subject: normalized.subject,
      strand: normalized.strand,
      awardType: titleCaseToken(input.awardType),
      awardScope: titleCaseToken(input.awardScope),
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      term: input.term,
      issuedDateLabel: formatDate(input.issuedAt),
      issuedAt: input.issuedAt,
      certificateNumber: input.certificateNumber,
      verificationCode: input.verificationCode,
      verificationUrl: input.verificationUrl,
      status: input.status,
      verificationBadgeLabel: "Verified Certificate",
      qrPlaceholderLabel: "Scan or visit verification link",
      signaturePlaceholder: "Academic Office Placeholder",
      verificationNote: "Verify this certificate using the code and link shown below.",
      score: typeof input.score === "number" ? input.score : null,
      evidenceSummaryText: input.evidenceSummaryText ?? null,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function optionalRow(label: string, value: string | null): string {
  if (!value) return "";
  return `<div class=\"meta-row\"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`;
}

export function buildCertificateExportHtml(payload: CertificateExportPayload): string {
  const statusClass = payload.status === "valid" ? "status-valid" : "status-issued";

  return `<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>${escapeHtml(payload.title)} - ${escapeHtml(payload.certificateNumber)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 20px; background: #f5f7fb; color: #0f172a; font-family: Georgia, "Times New Roman", serif; }
    .actions { margin: 0 auto 10px; max-width: 1100px; display: flex; justify-content: flex-end; }
    .button { border: 1px solid #94a3b8; border-radius: 10px; padding: 8px 12px; background: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
    .certificate { margin: 0 auto; max-width: 1100px; min-height: 700px; border: 10px solid #d4a93b; border-radius: 18px; background: linear-gradient(180deg, #fff8e6 0%, #ffffff 45%); padding: 24px 28px; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08); }
    .brand { text-align: center; font-family: "Palatino Linotype", "Book Antiqua", serif; }
    .brand .main { font-size: 30px; letter-spacing: 0.08em; font-weight: 700; color: #92400e; text-transform: uppercase; }
    .brand .sub { margin-top: 4px; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #475569; }
    .status { margin: 16px auto 0; width: fit-content; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; border: 1px solid; }
    .status-valid { background: #ecfdf5; color: #166534; border-color: #86efac; }
    .status-issued { background: #fffbeb; color: #92400e; border-color: #fcd34d; }
    .title { margin-top: 18px; text-align: center; font-size: 36px; font-weight: 700; color: #111827; }
    .recipient-intro { margin-top: 28px; text-align: center; color: #334155; font-size: 15px; }
    .recipient { margin-top: 8px; text-align: center; font-size: 40px; font-weight: 700; color: #0f172a; }
    .meta-grid { margin-top: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffffd6; padding: 14px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; font-size: 14px; }
    .meta-row { line-height: 1.4; }
    .verify { margin-top: 20px; border: 1px solid #cbd5e1; border-radius: 14px; background: #fff; padding: 14px; font-size: 12px; color: #334155; }
    .verify a { color: #0c4a6e; word-break: break-all; }
    .verify-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .verify-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; }
    .qr-wrap { margin-top: 10px; display: grid; gap: 10px; grid-template-columns: auto 1fr; align-items: start; }
    .qr-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px; background: #f8fafc; width: fit-content; }
    .qr-grid { display: grid; grid-template-columns: repeat(8, 6px); gap: 2px; }
    .qr-cell-on { width: 6px; height: 6px; border-radius: 1px; background: #0f172a; }
    .qr-cell-off { width: 6px; height: 6px; border-radius: 1px; background: #cbd5e1; }
    .qr-label { margin-top: 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: #64748b; text-transform: uppercase; }
    .footer { margin-top: 22px; display: flex; justify-content: space-between; gap: 14px; font-size: 12px; color: #475569; }
    .signature { border-top: 1px solid #cbd5e1; padding-top: 8px; min-width: 240px; }
    @media print {
      body { background: #fff; padding: 0; }
      .actions { display: none; }
      .certificate { box-shadow: none; border-radius: 0; max-width: none; min-height: auto; width: 297mm; min-width: 297mm; min-height: 210mm; margin: 0; }
      @page { size: A4 landscape; margin: 8mm; }
    }
  </style>
</head>
<body>
  <div class=\"actions\"><button class=\"button\" onclick=\"window.print()\">Print / Save as PDF</button></div>
  <section class=\"certificate\">
    <header class=\"brand\">
      <div class=\"main\">${escapeHtml(payload.issuer)}</div>
      <div class=\"sub\">${escapeHtml(payload.issuerSubline)}</div>
      <div class=\"status ${statusClass}\">${escapeHtml(payload.status.toUpperCase())}</div>
    </header>

    <h1 class=\"title\">${escapeHtml(payload.title)}</h1>
    <p class=\"recipient-intro\">This certificate is proudly awarded to</p>
    <p class=\"recipient\">${escapeHtml(payload.studentDisplayName)}</p>

    <section class=\"meta-grid\">
      <div class=\"meta-row\"><strong>Certificate type:</strong> ${escapeHtml(payload.typeLabel)}</div>
      <div class=\"meta-row\"><strong>Term:</strong> ${escapeHtml(payload.term)}</div>
      <div class=\"meta-row\"><strong>Year group:</strong> ${escapeHtml(payload.yearGroup ?? "Not set")}</div>
      <div class=\"meta-row\"><strong>Key stage:</strong> ${escapeHtml(payload.keyStage ?? "Not set")}</div>
      ${optionalRow("Subject", payload.subject)}
      ${optionalRow(payload.certificateType === "english_achievement" ? "English strand" : "Strand", payload.strand)}
      ${optionalRow("Award type", payload.awardType)}
      ${optionalRow("Award scope", payload.awardScope)}
      ${optionalRow("Score", typeof payload.score === "number" ? String(payload.score) : null)}
      ${optionalRow("Evidence", payload.evidenceSummaryText)}
      <div class=\"meta-row\"><strong>Issued date:</strong> ${escapeHtml(payload.issuedDateLabel)}</div>
    </section>

    <section class="verify">
      <div class="verify-top">
        <div class="verify-badge">${escapeHtml(payload.verificationBadgeLabel)}</div>
      </div>
      <div class="qr-wrap">
        <div class="qr-box">
          <div class="qr-grid">
            ${Array.from({ length: 64 }, (_, index) => {
              const code = payload.verificationCode || "SV";
              const char = code.charCodeAt(index % code.length);
              const on = ((char + index * 7) % 11) > 4;
              return `<span class=\"${on ? "qr-cell-on" : "qr-cell-off"}\"></span>`;
            }).join("")}
          </div>
          <div class="qr-label">QR placeholder</div>
        </div>
        <div>
      <div class=\"meta-row\"><strong>Certificate number:</strong> ${escapeHtml(payload.certificateNumber)}</div>
      <div class=\"meta-row\"><strong>Verification code:</strong> ${escapeHtml(payload.verificationCode)}</div>
      <div class=\"meta-row\"><strong>Verification link:</strong> <a href=\"${escapeHtml(payload.verificationUrl)}\">${escapeHtml(payload.verificationUrl)}</a></div>
      <div class="meta-row">${escapeHtml(payload.qrPlaceholderLabel)}</div>
      <div class=\"meta-row\">${escapeHtml(payload.verificationNote)}</div>
        </div>
      </div>
    </section>

    <footer class=\"footer\">
      <div class=\"signature\">Signature: ${escapeHtml(payload.signaturePlaceholder)}</div>
      <div>${escapeHtml(payload.issuer)} Certificate Office</div>
    </footer>
  </section>
</body>
</html>`;
}
