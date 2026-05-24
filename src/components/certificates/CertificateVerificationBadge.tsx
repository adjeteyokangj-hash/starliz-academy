type VerificationBadgeStatus = "valid" | "issued" | "revoked";

type CertificateVerificationBadgeProps = {
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  status: VerificationBadgeStatus;
};

function statusClass(status: VerificationBadgeStatus): string {
  if (status === "valid") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "revoked") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function statusLabel(status: VerificationBadgeStatus): string {
  if (status === "valid") return "valid";
  if (status === "revoked") return "revoked";
  return "issued";
}

function qrCellFilled(code: string, index: number): boolean {
  if (!code) return index % 3 === 0;
  const char = code.charCodeAt(index % code.length);
  return ((char + index * 7) % 11) > 4;
}

export default function CertificateVerificationBadge(props: CertificateVerificationBadgeProps) {
  const cells = Array.from({ length: 64 }, (_, index) => (
    <span
      key={`qr-cell-${index}`}
      className={qrCellFilled(props.verificationCode, index) ? "h-2 w-2 rounded-[1px] bg-slate-900" : "h-2 w-2 rounded-[1px] bg-slate-200"}
    />
  ));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-700">Verified Certificate</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${statusClass(props.status)}`}>
          {statusLabel(props.status)}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[auto,1fr] sm:items-start">
        <div className="w-fit rounded-lg border border-slate-300 bg-slate-50 p-2">
          <div className="grid grid-cols-8 gap-[2px]" aria-hidden="true">
            {cells}
          </div>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">QR placeholder</p>
        </div>

        <div className="space-y-1">
          <p>
            Certificate number: <span className="font-mono font-semibold text-slate-900">{props.certificateNumber}</span>
          </p>
          <p>
            Verification code: <span className="font-mono font-semibold text-slate-900">{props.verificationCode}</span>
          </p>
          <p className="break-all">
            Verification link: <a href={props.verificationUrl} className="font-semibold text-cyan-700 underline underline-offset-2 hover:text-cyan-900">{props.verificationUrl}</a>
          </p>
          <p className="text-[11px] text-slate-500">Scan or visit verification link</p>
        </div>
      </div>
    </section>
  );
}