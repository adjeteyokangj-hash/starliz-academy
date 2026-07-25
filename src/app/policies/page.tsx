import Link from "next/link";
import PublicShell from "@/components/layout/PublicShell";
import { getPolicyBySlug, POLICY_HUB_GROUPS } from "@/lib/policies/registry";

export const metadata = {
  title: "Policies | StarLiz Academy",
  description: "Legal, learning and operational policies for StarLiz Academy.",
};

export default function Policies() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h1 className="mb-4 text-4xl font-black">Policies</h1>
        <p className="mb-4 text-slate-400">
          Drafts aligned to the finished UK launch product. Legal documents require professional legal review before formal approval.
        </p>
        <p className="mb-12 text-sm text-amber-200/90">
          Draft for legal review — not formal legal advice. AI teaching is guaranteed; human support is a safety net when available — not a private 1:1 tutor booking. There are no Short Learning cancellation fees.
        </p>

        <div className="space-y-12">
          {POLICY_HUB_GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className="text-2xl font-bold text-white">{group.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{group.description}</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {group.slugs.map((slug) => {
                  const doc = getPolicyBySlug(slug);
                  if (!doc || doc.publicVisible === false) return null;
                  return (
                    <Link
                      key={slug}
                      href={doc.publicPath ?? `/policies/${doc.slug}`}
                      className="rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-blue-500/60 hover:bg-slate-900/80"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-bold text-white">{doc.title}</h3>
                        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                          {doc.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{doc.summary}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <p className="text-sm font-semibold text-slate-200">Need plain-language help?</p>
          <p className="mt-2 text-sm text-slate-400">
            Visit the{" "}
            <Link href="/knowledge-centre" className="font-semibold text-blue-400 hover:text-blue-300">
              Knowledge Centre
            </Link>{" "}
            or{" "}
            <Link href="/faq" className="font-semibold text-blue-400 hover:text-blue-300">
              FAQ
            </Link>
            .
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
