type CertificateAwardDetailsProps = {
  awardType: string | null;
  awardScope: string | null;
  score: number | null;
  evidenceSummaryText: string | null;
  awardReason?: string | null;
  competitionName?: string | null;
  testName?: string | null;
  rankLabel?: string | null;
  tiedRank?: boolean | null;
  rankingMethod?: string | null;
};

export default function CertificateAwardDetails(props: CertificateAwardDetailsProps) {
  if (
    !props.awardType
    && !props.awardScope
    && typeof props.score !== "number"
    && !props.evidenceSummaryText
    && !props.awardReason
    && !props.competitionName
    && !props.testName
    && !props.rankLabel
  ) {
    return null;
  }

  return (
    <section className="mt-4 grid gap-2 rounded-2xl border border-yellow-200 bg-yellow-50/70 p-4 text-sm text-slate-700 sm:grid-cols-2">
      {props.awardType ? <p>Award type: <span className="font-semibold text-slate-900">{props.awardType}</span></p> : null}
      {props.awardScope ? <p>Award scope: <span className="font-semibold text-slate-900">{props.awardScope}</span></p> : null}
      {props.rankLabel ? <p>Rank / place: <span className="font-semibold text-slate-900">{props.rankLabel}</span></p> : null}
      {props.competitionName ? <p>Competition: <span className="font-semibold text-slate-900">{props.competitionName}</span></p> : null}
      {props.testName ? <p>Test / quiz / challenge: <span className="font-semibold text-slate-900">{props.testName}</span></p> : null}
      {typeof props.score === "number" ? <p>Award score: <span className="font-semibold text-slate-900">{props.score}</span></p> : null}
      {typeof props.tiedRank === "boolean" ? <p>Tied rank: <span className="font-semibold text-slate-900">{props.tiedRank ? "Yes" : "No"}</span></p> : null}
      {props.rankingMethod ? <p>Ranking method: <span className="font-semibold text-slate-900">{props.rankingMethod.replaceAll("_", " ")}</span></p> : null}
      {props.awardReason ? <p className="sm:col-span-2">Award reason: <span className="font-semibold text-slate-900">{props.awardReason}</span></p> : null}
      {props.evidenceSummaryText ? <p className="sm:col-span-2">Evidence summary: <span className="font-semibold text-slate-900">{props.evidenceSummaryText}</span></p> : null}
    </section>
  );
}
