"use client";

import CertificateAwardDetails from "@/components/certificates/CertificateAwardDetails";
import CertificateFrame from "@/components/certificates/CertificateFrame";
import CertificateMetadata from "@/components/certificates/CertificateMetadata";
import CertificateRecipient from "@/components/certificates/CertificateRecipient";
import CertificateSeal from "@/components/certificates/CertificateSeal";
import CertificateSubjectDetails from "@/components/certificates/CertificateSubjectDetails";
import CertificateVerificationBlock from "@/components/certificates/CertificateVerificationBlock";
import { resolveCertificateDesign, type CertificateDesignInput, type CertificatePreviewStatus } from "@/components/certificates/certificate-designs";

export type CertificatePreviewProps = CertificateDesignInput & {
  showPrintAction?: boolean;
};

function formatIssuedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
}

function statusClass(status: CertificatePreviewStatus): string {
  if (status === "revoked") {
    return "rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-rose-700";
  }
  if (status === "valid") {
    return "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700";
  }
  return "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-amber-700";
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

export default function CertificatePreview(props: CertificatePreviewProps) {
  const design = resolveCertificateDesign(props);

  return (
    <div className="space-y-3">
      {props.showPrintAction ? (
        <div className="flex justify-end print:hidden">
          <button
            type="button"
            data-print-action="browser-print"
            onClick={() => window.print()}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Print / Save as PDF
          </button>
        </div>
      ) : null}

      <CertificateFrame
        themeName={design.theme}
        statusClassName={statusClass(props.status)}
        badgeText={design.badgeText}
        accentLabel={design.accentLabel}
        printClassName={design.printClassName}
      >
        <CertificateRecipient
          themeName={design.theme}
          title={design.title}
          subtitle={design.subtitle}
          recipientLine={design.recipientLine}
          recipientName={props.studentDisplayName}
          bodyText={design.bodyText}
        />

        <CertificateSeal themeName={design.theme} label={design.sealLabel} />

        <CertificateMetadata
          themeName={design.theme}
          typeLabel={props.typeLabel}
          term={props.term}
          yearGroup={props.yearGroup}
          keyStage={props.keyStage}
          issuedDateLabel={formatIssuedDate(props.issuedAt)}
        />

        {design.showSubjectDetails ? (
          <CertificateSubjectDetails
            subject={design.normalizedSubject}
            strand={design.normalizedStrand}
            showEnglishStrands={design.showEnglishStrands}
          />
        ) : null}

        {design.showAwardDetails ? (
          <CertificateAwardDetails
            awardType={titleCaseToken(props.awardType)}
            awardScope={titleCaseToken(props.awardScope)}
            score={typeof props.score === "number" ? props.score : null}
            evidenceSummaryText={props.evidenceSummaryText ?? null}
          />
        ) : null}

        {design.showVerificationBlock ? (
          <CertificateVerificationBlock
            certificateNumber={props.certificateNumber}
            verificationCode={props.verificationCode}
            verificationUrl={props.verificationUrl}
            footerNote={design.footerNote}
          />
        ) : null}
      </CertificateFrame>
    </div>
  );
}