import CertificateVerificationBadge from "@/components/certificates/CertificateVerificationBadge";

type CertificateVerificationBlockProps = {
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  status: "valid" | "issued" | "revoked";
  footerNote: string;
};

export default function CertificateVerificationBlock(props: CertificateVerificationBlockProps) {
  return (
    <section className="mt-6 space-y-2">
      <CertificateVerificationBadge
        certificateNumber={props.certificateNumber}
        verificationCode={props.verificationCode}
        verificationUrl={props.verificationUrl}
        status={props.status}
      />
      <p className="px-1 text-[11px] text-slate-500">{props.footerNote}</p>
    </section>
  );
}
