type StudentContextStripProps = {
  studentName?: string;
  ageGroup?: string;
  yearGroup?: string;
  keyStage?: string;
  curriculum?: string;
  className?: string;
};

function clean(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

export default function StudentContextStrip({
  studentName,
  ageGroup,
  yearGroup,
  keyStage,
  curriculum,
  className,
}: StudentContextStripProps) {
  const cleanName = clean(studentName);
  const cleanAgeGroup = clean(ageGroup);
  const cleanYearGroup = clean(yearGroup);
  const cleanKeyStage = clean(keyStage);
  const cleanCurriculum = clean(curriculum);

  if (!cleanAgeGroup && !cleanYearGroup && !cleanKeyStage && !cleanCurriculum) {
    return null;
  }

  const containerClass = [
    "rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-slate-700",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {cleanName ? <span>Student: {cleanName}</span> : null}
        {cleanName && (cleanAgeGroup || cleanYearGroup || cleanKeyStage || cleanCurriculum) ? <span className="text-slate-300">|</span> : null}
        {cleanAgeGroup ? <span>Age: {cleanAgeGroup} years</span> : null}
        {cleanAgeGroup && (cleanYearGroup || cleanKeyStage || cleanCurriculum) ? <span className="text-slate-300">|</span> : null}
        {cleanYearGroup ? <span>Year Group: {cleanYearGroup}</span> : null}
        {cleanYearGroup && (cleanKeyStage || cleanCurriculum) ? <span className="text-slate-300">|</span> : null}
        {cleanKeyStage ? <span>Key Stage: {cleanKeyStage}</span> : null}
        {cleanKeyStage && cleanCurriculum ? <span className="text-slate-300">|</span> : null}
        {cleanCurriculum ? <span>Curriculum: {cleanCurriculum}</span> : null}
      </div>
    </div>
  );
}
