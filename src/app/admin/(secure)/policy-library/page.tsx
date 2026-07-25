import Link from "next/link";
import { ALL_POLICY_DOCUMENTS, listLegalReviewRequired, policyDocumentHref } from "@/lib/policies/registry";

export const metadata = {
  title: "Policy library | Admin",
  description: "Full Phase 6 policy library for platform operators.",
};

/** Read-only full library — no CMS publishing workflow in Phase 6. */
export default function AdminPolicyLibraryPage() {
  const legal = listLegalReviewRequired();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 text-slate-100">
      <h1 className="text-3xl font-black">Policy & Knowledge library</h1>
      <p className="mt-2 text-sm text-slate-400">
        Full draft set ({ALL_POLICY_DOCUMENTS.length} documents). Content is code-managed; statuses are editorial metadata only.
        Staff handbooks and runbooks are authenticated-only.
      </p>
      <p className="mt-3 text-xs text-amber-200">
        Draft for legal review — {legal.length} documents flagged for external legal review. See docs/PHASE6_LEGAL_REVIEW_CHECKLIST.md.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3">Legal review</th>
            </tr>
          </thead>
          <tbody>
            {ALL_POLICY_DOCUMENTS.map((doc) => (
              <tr key={doc.id} className="border-t border-slate-800">
                <td className="px-4 py-3">
                  <Link href={policyDocumentHref(doc, "admin")} className="font-semibold text-blue-300 hover:text-blue-200">
                    {doc.title}
                  </Link>
                  <p className="text-xs text-slate-500">v{doc.version} · {doc.effectiveDate}</p>
                </td>
                <td className="px-4 py-3">{doc.status}</td>
                <td className="px-4 py-3">{doc.category}</td>
                <td className="px-4 py-3">{doc.publicVisible === false ? "Staff only" : "Public"}</td>
                <td className="px-4 py-3">{doc.legalReviewRequired ? "Required" : "Internal"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
