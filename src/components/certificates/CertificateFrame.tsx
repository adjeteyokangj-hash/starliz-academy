import type { ReactNode } from "react";
import { certificateTheme, type CertificateThemeName } from "@/components/certificates/certificate-theme";

type CertificateFrameProps = {
  children: ReactNode;
  themeName: CertificateThemeName;
  statusClassName: string;
  badgeText: string;
  accentLabel: string;
  printClassName: string;
};

export default function CertificateFrame(props: CertificateFrameProps) {
  const theme = certificateTheme(props.themeName);

  return (
    <article className={`w-full overflow-hidden rounded-3xl border shadow-sm ${theme.frameClassName} ${props.printClassName}`}>
      <div className={`border-b px-5 py-4 sm:px-8 ${theme.headerClassName}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`text-xs font-black uppercase tracking-[0.22em] ${theme.accentClassName}`}>StarLiz Academy</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">By Okang Group</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
              {props.accentLabel}
            </span>
            <span className={props.statusClassName}>Status: {props.badgeText}</span>
          </div>
        </div>
      </div>
      <div className="px-5 py-6 sm:px-8 sm:py-8">{props.children}</div>
    </article>
  );
}
