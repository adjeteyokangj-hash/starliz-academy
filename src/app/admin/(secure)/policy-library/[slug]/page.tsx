import { notFound } from "next/navigation";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { ALL_POLICY_DOCUMENTS, getPolicyBySlug } from "@/lib/policies/registry";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return ALL_POLICY_DOCUMENTS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const doc = getPolicyBySlug(slug);
  if (!doc) return { title: "Policy" };
  return {
    title: `${doc.title} | Admin policy library`,
    description: doc.summary,
  };
}

/** Authenticated Platform Admin viewer — includes staff-only handbooks/runbooks. */
export default async function AdminPolicyLibraryDocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = getPolicyBySlug(slug);
  if (!doc) notFound();

  return (
    <div className="min-h-screen bg-slate-950">
      <PolicyDocumentView doc={doc} libraryContext="admin" />
    </div>
  );
}
