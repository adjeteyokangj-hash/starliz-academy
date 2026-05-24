export type CertificateThemeName =
  | "classic_academic"
  | "exam_honours"
  | "subject_focus"
  | "english_scholar"
  | "mastery_prestige"
  | "award_prestige";

export type CertificateTheme = {
  frameClassName: string;
  headerClassName: string;
  titleClassName: string;
  recipientClassName: string;
  panelClassName: string;
  sealClassName: string;
  accentClassName: string;
};

const THEMES: Record<CertificateThemeName, CertificateTheme> = {
  classic_academic: {
    frameClassName: "border-amber-300 bg-gradient-to-b from-amber-50 via-white to-slate-50",
    headerClassName: "border-amber-200 bg-[linear-gradient(120deg,rgba(255,251,235,0.95),rgba(255,255,255,1))]",
    titleClassName: "text-slate-900",
    recipientClassName: "text-slate-900",
    panelClassName: "border-amber-100 bg-white/85",
    sealClassName: "border-amber-400 bg-amber-100 text-amber-900",
    accentClassName: "text-amber-700",
  },
  exam_honours: {
    frameClassName: "border-sky-300 bg-gradient-to-b from-sky-50 via-white to-slate-50",
    headerClassName: "border-sky-200 bg-[linear-gradient(120deg,rgba(240,249,255,0.95),rgba(255,255,255,1))]",
    titleClassName: "text-slate-900",
    recipientClassName: "text-slate-900",
    panelClassName: "border-sky-100 bg-white/85",
    sealClassName: "border-sky-400 bg-sky-100 text-sky-900",
    accentClassName: "text-sky-700",
  },
  subject_focus: {
    frameClassName: "border-indigo-300 bg-gradient-to-b from-indigo-50 via-white to-slate-50",
    headerClassName: "border-indigo-200 bg-[linear-gradient(120deg,rgba(238,242,255,0.95),rgba(255,255,255,1))]",
    titleClassName: "text-slate-900",
    recipientClassName: "text-slate-900",
    panelClassName: "border-indigo-100 bg-white/85",
    sealClassName: "border-indigo-400 bg-indigo-100 text-indigo-900",
    accentClassName: "text-indigo-700",
  },
  english_scholar: {
    frameClassName: "border-cyan-300 bg-gradient-to-b from-cyan-50 via-white to-slate-50",
    headerClassName: "border-cyan-200 bg-[linear-gradient(120deg,rgba(236,254,255,0.95),rgba(255,255,255,1))]",
    titleClassName: "text-slate-900",
    recipientClassName: "text-slate-900",
    panelClassName: "border-cyan-100 bg-white/85",
    sealClassName: "border-cyan-400 bg-cyan-100 text-cyan-900",
    accentClassName: "text-cyan-700",
  },
  mastery_prestige: {
    frameClassName: "border-violet-300 bg-gradient-to-b from-violet-50 via-white to-slate-50",
    headerClassName: "border-violet-200 bg-[linear-gradient(120deg,rgba(245,243,255,0.95),rgba(255,255,255,1))]",
    titleClassName: "text-slate-900",
    recipientClassName: "text-slate-900",
    panelClassName: "border-violet-100 bg-white/85",
    sealClassName: "border-violet-400 bg-violet-100 text-violet-900",
    accentClassName: "text-violet-700",
  },
  award_prestige: {
    frameClassName: "border-yellow-400 bg-gradient-to-b from-yellow-50 via-white to-amber-50",
    headerClassName: "border-yellow-300 bg-[linear-gradient(120deg,rgba(254,252,232,0.98),rgba(255,255,255,1))]",
    titleClassName: "text-slate-900",
    recipientClassName: "text-slate-900",
    panelClassName: "border-yellow-200 bg-white/90",
    sealClassName: "border-yellow-500 bg-yellow-100 text-yellow-900",
    accentClassName: "text-yellow-700",
  },
};

export function certificateTheme(themeName: CertificateThemeName): CertificateTheme {
  return THEMES[themeName];
}
