import Link from "next/link";
import { draftBanner, type PolicyDocument } from "@/lib/policies/types";
import { getPolicyBySlug } from "@/lib/policies/registry";

type PolicyDocumentViewProps = {
  doc: PolicyDocument;
  /** When set, related links and back navigation stay inside this authenticated library. */
  libraryContext?: "admin" | "school-admin";
};

export function PolicyDocumentView({ doc, libraryContext }: PolicyDocumentViewProps) {
  const banner = draftBanner(doc);
  const related = (doc.relatedDocumentIds ?? [])
    .map((id) => getPolicyBySlug(id))
    .filter(Boolean) as PolicyDocument[];

  const hrefFor = (item: PolicyDocument) => {
    if (libraryContext === "admin") {
      return item.publicVisible === false
        ? `/admin/policy-library/${item.slug}`
        : (item.publicPath ?? `/policies/${item.slug}`);
    }
    if (libraryContext === "school-admin") {
      return item.publicVisible === false
        ? `/school-admin/knowledge-library/${item.slug}`
        : (item.publicPath ?? `/policies/${item.slug}`);
    }
    return item.publicPath ?? `/policies/${item.slug}`;
  };

  const backHref =
    libraryContext === "admin"
      ? "/admin/policy-library"
      : libraryContext === "school-admin"
        ? "/school-admin/knowledge-library"
        : "/policies";
  const backLabel =
    libraryContext === "admin"
      ? "Back to Policy library"
      : libraryContext === "school-admin"
        ? "Back to Knowledge library"
        : "Back to Policies";

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {doc.category} · v{doc.version} · {doc.status}
        {doc.publicVisible === false ? " · Staff only" : ""}
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-white">{doc.title}</h1>
      <p className="mt-4 text-lg leading-8 text-slate-300">{doc.summary}</p>

      {banner ? (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {banner}
        </div>
      ) : null}

      <dl className="mt-8 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Effective</dt>
          <dd>{doc.effectiveDate}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Last reviewed</dt>
          <dd>{doc.lastReviewed}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Next review</dt>
          <dd>{doc.nextReview}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Owner</dt>
          <dd>{doc.owner}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Audience</dt>
          <dd>{doc.audience.join(", ")}</dd>
        </div>
      </dl>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-bold text-white">Purpose</h2>
        <p className="leading-7 text-slate-300">{doc.purpose}</p>
        <h2 className="text-xl font-bold text-white">Scope</h2>
        <p className="leading-7 text-slate-300">{doc.scope}</p>
      </section>

      {doc.definitions && doc.definitions.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-white">Definitions</h2>
          <ul className="mt-4 space-y-3">
            {doc.definitions.map((item) => (
              <li key={item.term} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="font-semibold text-white">{item.term}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{item.meaning}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.responsibilities && doc.responsibilities.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-white">Responsibilities</h2>
          <ul className="mt-4 space-y-3">
            {doc.responsibilities.map((item) => (
              <li key={item.role} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="font-semibold text-white">{item.role}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{item.duty}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 space-y-10">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-bold text-white">{section.heading}</h2>
            <div className="mt-3 space-y-3">
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="leading-7 text-slate-300">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      {doc.exceptions && doc.exceptions.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-white">Exceptions</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
            {doc.exceptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-300 sm:grid-cols-2">
        <div>
          <p className="font-semibold text-white">Reporting</p>
          <p className="mt-1">{doc.reportingRoute ?? "support@starlizacademy.com"}</p>
        </div>
        <div>
          <p className="font-semibold text-white">Complaints</p>
          <p className="mt-1">{doc.complaintsRoute ?? "support@starlizacademy.com"}</p>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-white">Related documents</h2>
          <ul className="mt-3 space-y-2">
            {related.map((item) => (
              <li key={item.id}>
                <Link href={hrefFor(item)} className="text-blue-400 hover:text-blue-300">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xl font-bold text-white">Change history</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-400">
          {doc.changeHistory.map((entry) => (
            <li key={`${entry.version}-${entry.date}`}>
              v{entry.version} · {entry.date} — {entry.summary}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 text-sm text-slate-500">
        <Link href={backHref} className="text-blue-400 hover:text-blue-300">
          {backLabel}
        </Link>
        {libraryContext ? null : (
          <>
            {" · "}
            <Link href="/knowledge-centre" className="text-blue-400 hover:text-blue-300">
              Knowledge Centre
            </Link>
          </>
        )}
      </p>
    </article>
  );
}
