type CertificateSubjectDetailsProps = {
  subject: string | null;
  strand: string | null;
  showEnglishStrands: boolean;
};

export default function CertificateSubjectDetails(props: CertificateSubjectDetailsProps) {
  if (!props.subject && !props.strand) return null;

  return (
    <section className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 sm:grid-cols-2">
      {props.subject ? <p>Subject: <span className="font-semibold text-slate-900">{props.subject}</span></p> : null}
      {props.strand ? <p>{props.showEnglishStrands ? "English strand" : "Strand"}: <span className="font-semibold text-slate-900">{props.strand}</span></p> : null}
    </section>
  );
}
