import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PolicyDocShell from "@/components/layout/PolicyDocShell";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { listPublicPolicyDocuments } from "@/lib/policies/registry";
import { resolvePublicPolicy } from "@/lib/policies/resolve-public";
import { CONTACT } from "@/lib/policies/locked-facts";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listPublicPolicyDocuments().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePublicPolicy(slug);
  if (!resolved) return { title: "Not found", robots: { index: false, follow: false } };
  const canonical = resolved.doc.publicPath ?? `/policies/${resolved.doc.slug}`;
  return {
    title: `${resolved.doc.title} | StarLiz Academy`,
    description: resolved.doc.summary,
    alternates: { canonical },
    robots: resolved.source === "cms" ? { index: true, follow: true } : { index: true, follow: true },
  };
}

export default async function PolicySlugPage({ params }: PageProps) {
  const { slug } = await params;
  const resolved = await resolvePublicPolicy(slug);
  if (!resolved) notFound();

  return (
    <PolicyDocShell>
      <article className="policy-print">
        <PolicyDocumentView doc={resolved.doc} />
        <footer className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-600 print:text-black">
          <p>
            Version {resolved.version ?? resolved.doc.version}
            {resolved.effectiveDate
              ? ` · Effective ${new Date(resolved.effectiveDate).toLocaleDateString("en-GB")}`
              : resolved.doc.effectiveDate
                ? ` · Effective ${resolved.doc.effectiveDate}`
                : null}
            {resolved.lastUpdatedAt
              ? ` · Last updated ${new Date(resolved.lastUpdatedAt).toLocaleDateString("en-GB")}`
              : ` · Last reviewed ${resolved.doc.lastReviewed}`}
          </p>
          <p className="mt-2">
            Contact: {CONTACT.supportEmail} · Safeguarding: {CONTACT.safeguardingEmail}
          </p>
        </footer>
      </article>
    </PolicyDocShell>
  );
}
