import CollapsibleCard from "@/components/school-admin/CollapsibleCard";
import Link from "next/link";
import { listDocumentsForAudience, policyDocumentHref } from "@/lib/policies/registry";

export const metadata = {
  title: "Knowledge library | School Admin",
  description: "School-relevant policy and operations drafts.",
};

/** Read-only library — no publishing workflow added in Phase 6. */
export default function SchoolAdminKnowledgeLibraryPage() {
  const docs = [
    ...listDocumentsForAudience("School Admin"),
    ...listDocumentsForAudience("Tutor"),
  ].filter((doc, index, all) => all.findIndex((item) => item.id === doc.id) === index);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-black text-slate-900">Knowledge library</h1>
      <p className="mt-2 text-sm text-slate-600">
        Read-only drafts for school operators. Staff handbooks and runbooks are authenticated-only here.
        Operational Short Learning settings remain under{" "}
        <Link href="/school-admin/short-learning/policies" className="font-semibold text-blue-700">
          Policies/Settings
        </Link>
        . Public parents should use the{" "}
        <Link href="/knowledge-centre" className="font-semibold text-blue-700">
          Knowledge Centre
        </Link>
        .
      </p>
      <p className="mt-3 text-xs text-amber-800">
        Draft for legal/internal review — not formal legal advice. AI teaching is guaranteed; human support is a safety net when available.
      </p>

      <CollapsibleCard title="Documents" count={docs.length} className="mt-8" bodyClassName="p-4">
      <ul className="space-y-3">
        {docs.map((doc) => (
          <li key={doc.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={policyDocumentHref(doc, "school-admin")}
                className="font-semibold text-slate-900 hover:text-blue-700"
              >
                {doc.title}
              </Link>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                {doc.status} · v{doc.version}
                {doc.publicVisible === false ? " · Staff only" : ""}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{doc.summary}</p>
            <p className="mt-2 text-xs text-slate-400">
              Effective {doc.effectiveDate} · Next review {doc.nextReview} · Audience: {doc.audience.join(", ")}
            </p>
          </li>
        ))}
      </ul>
      </CollapsibleCard>
    </div>
  );
}
