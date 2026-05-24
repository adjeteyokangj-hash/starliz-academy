type CertificateAwardDetailsProps = {
  awardType: string | null;
  awardScope: string | null;
  score: number | null;
  evidenceSummaryText: string | null;
};

export default function CertificateAwardDetails(props: CertificateAwardDetailsProps) {
  if (!props.awardType && !props.awardScope && typeof props.score !== "number" && !props.evidenceSummaryText) {
    return null;
  }

  return (
    <section className="mt-4 grid gap-2 rounded-2xl border border-yellow-200 bg-yellow-50/70 p-4 text-sm text-slate-700 sm:grid-cols-2">
      {props.awardType ? <p>Award type: <span className="font-semibold text-slate-900">{props.awardType}</span></p> : null}
      {props.awardScope ? <p>Award scope: <span className="font-semibold text-slate-900">{props.awardScope}</span></p> : null}
      {typeof props.score === "number" ? <p>Award score: <span className="font-semibold text-slate-900">{props.score}</span></p> : null}
      {props.evidenceSummaryText ? <p className="sm:col-span-2">Evidence summary: <span className="font-semibold text-slate-900">{props.evidenceSummaryText}</span></p> : null}
    </section>
  );
}
