import Image from "next/image";
import { buildVerificationQrDataUrl } from "@/lib/certificate-qr";

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

export default function CertificateVerificationBadge(props: CertificateVerificationBadgeProps) {
  const qrDataUrl = buildVerificationQrDataUrl(props.verificationUrl, { cellSize: 5, marginCells: 2 });

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
          <Image
            src={qrDataUrl}
            alt="Verification QR code"
            width={96}
            height={96}
            className="h-24 w-24 rounded border border-slate-300 bg-white p-1"
            loading="lazy"
            unoptimized
          />
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Real verification QR</p>
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