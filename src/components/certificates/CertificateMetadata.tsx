import { certificateTheme, type CertificateThemeName } from "@/components/certificates/certificate-theme";

type CertificateMetadataProps = {
  themeName: CertificateThemeName;
  typeLabel: string;
  term: string;
  yearGroup: string | null;
  keyStage: string | null;
  issuedDateLabel: string;
};

export default function CertificateMetadata(props: CertificateMetadataProps) {
  const theme = certificateTheme(props.themeName);

  return (
    <section className={`mt-6 grid gap-2 rounded-2xl border p-4 text-sm text-slate-700 sm:grid-cols-2 ${theme.panelClassName}`}>
      <p>Certificate type: <span className="font-semibold text-slate-900">{props.typeLabel}</span></p>
      <p>Term: <span className="font-semibold text-slate-900">{props.term}</span></p>
      <p>Year group: <span className="font-semibold text-slate-900">{props.yearGroup ?? "Not set"}</span></p>
      <p>Key stage: <span className="font-semibold text-slate-900">{props.keyStage ?? "Not set"}</span></p>
      <p>Issued date: <span className="font-semibold text-slate-900">{props.issuedDateLabel}</span></p>
      <p>Signature: <span className="font-semibold text-slate-900">Academic Office Placeholder</span></p>
    </section>
  );
}
