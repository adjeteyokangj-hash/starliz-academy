import { certificateTheme, type CertificateThemeName } from "@/components/certificates/certificate-theme";

type CertificateSealProps = {
  themeName: CertificateThemeName;
  label: string;
};

export default function CertificateSeal(props: CertificateSealProps) {
  const theme = certificateTheme(props.themeName);

  return (
    <div className="mt-4 flex justify-center">
      <div className={`inline-flex h-20 w-20 items-center justify-center rounded-full border-2 p-2 text-center text-[10px] font-black uppercase tracking-[0.08em] ${theme.sealClassName}`}>
        {props.label}
      </div>
    </div>
  );
}
