import { certificateTheme, type CertificateThemeName } from "@/components/certificates/certificate-theme";

type CertificateRecipientProps = {
  themeName: CertificateThemeName;
  title: string;
  subtitle: string;
  recipientLine: string;
  recipientName: string;
  bodyText: string;
};

export default function CertificateRecipient(props: CertificateRecipientProps) {
  const theme = certificateTheme(props.themeName);

  return (
    <section>
      <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Certificate</p>
      <h3 className={`mt-2 text-center text-2xl font-black sm:text-3xl ${theme.titleClassName}`}>{props.title}</h3>
      <p className="mt-1 text-center text-sm font-semibold text-slate-600">{props.subtitle}</p>
      <p className="mt-6 text-center text-sm text-slate-600">{props.recipientLine}</p>
      <p className={`mt-1 text-center text-3xl font-black tracking-wide sm:text-4xl ${theme.recipientClassName}`}>{props.recipientName}</p>
      <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-slate-700">{props.bodyText}</p>
    </section>
  );
}
