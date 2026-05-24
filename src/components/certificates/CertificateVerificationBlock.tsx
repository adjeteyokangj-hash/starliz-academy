type CertificateVerificationBlockProps = {
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  footerNote: string;
};

export default function CertificateVerificationBlock(props: CertificateVerificationBlockProps) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
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
      <p className="mt-2 text-[11px] text-slate-500">{props.footerNote}</p>
    </section>
  );
}
