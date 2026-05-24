type CertificatePreviewStatus = "valid" | "issued" | "revoked";

export type CertificatePreviewProps = {
  title: string;
  studentDisplayName: string;
  certificateType: "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate" | "award_certificate";
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
  status: CertificatePreviewStatus;
};

function formatIssuedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
}

function formatTokenLabel(value: string | null): string | null {
  if (!value) return null;
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function statusBadge(status: CertificatePreviewStatus): string {
  if (status === "revoked") {
    return "rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-rose-700";
  }
  if (status === "valid") {
    return "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700";
  }
  return "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-amber-700";
}

function statusLabel(status: CertificatePreviewStatus): string {
  if (status === "revoked") return "revoked";
  if (status === "valid") return "valid";
  return "issued";
}

export default function CertificatePreview(props: CertificatePreviewProps) {
  const isAward = props.certificateType === "award_certificate";

  return (
    <article className="w-full overflow-hidden rounded-3xl border border-amber-300 bg-gradient-to-b from-amber-50 via-white to-slate-50 shadow-sm">
      <div className="border-b border-amber-200 bg-[linear-gradient(120deg,rgba(255,251,235,0.95),rgba(255,255,255,1))] px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700">StarLiz Academy</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">By Okang Group</p>
          </div>
          <span className={statusBadge(props.status)}>Status: {statusLabel(props.status)}</span>
        </div>
      </div>

      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Certificate</p>
        <h3 className="mt-2 text-center text-xl font-black text-slate-900 sm:text-2xl">{props.title}</h3>
        <p className="mt-6 text-center text-sm text-slate-600">This certificate is proudly awarded to</p>
        <p className="mt-1 text-center text-2xl font-black tracking-wide text-slate-900 sm:text-3xl">{props.studentDisplayName}</p>

        {isAward ? (
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-slate-700">
            This award is presented in recognition of outstanding progress, commitment, and achievement.
          </p>
        ) : (
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-slate-700">
            for successfully completing the required StarLiz Academy learning evidence.
          </p>
        )}

        <div className="mt-6 grid gap-2 rounded-2xl border border-amber-100 bg-white/80 p-4 text-sm text-slate-700 sm:grid-cols-2">
          <p>Certificate type: <span className="font-semibold text-slate-900">{props.typeLabel}</span></p>
          <p>Term: <span className="font-semibold text-slate-900">{props.term}</span></p>
          <p>Year group: <span className="font-semibold text-slate-900">{props.yearGroup ?? "Not set"}</span></p>
          <p>Key stage: <span className="font-semibold text-slate-900">{props.keyStage ?? "Not set"}</span></p>
          {props.subject ? <p>Subject: <span className="font-semibold text-slate-900">{props.subject}</span></p> : null}
          {props.strand ? <p>English strand: <span className="font-semibold text-slate-900">{formatTokenLabel(props.strand)}</span></p> : null}
          {props.awardType ? <p>Award type: <span className="font-semibold text-slate-900">{formatTokenLabel(props.awardType)}</span></p> : null}
          {props.awardScope ? <p>Award scope: <span className="font-semibold text-slate-900">{formatTokenLabel(props.awardScope)}</span></p> : null}
          <p>Issued date: <span className="font-semibold text-slate-900">{formatIssuedDate(props.issuedAt)}</span></p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              Certificate number: <span className="font-mono font-semibold text-slate-900">{props.certificateNumber}</span>
            </p>
            <p>
              Verification code: <span className="font-mono font-semibold text-slate-900">{props.verificationCode}</span>
            </p>
          </div>
          <p className="mt-2 break-all">
            Verification link: <a href={props.verificationUrl} className="font-semibold text-cyan-700 underline underline-offset-2 hover:text-cyan-900">{props.verificationUrl}</a>
          </p>
        </div>
      </div>
    </article>
  );
}