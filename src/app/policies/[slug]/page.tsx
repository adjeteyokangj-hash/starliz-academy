import { notFound } from "next/navigation";
import PolicyDocShell from "@/components/layout/PolicyDocShell";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { getPolicyBySlug, listPublicPolicyDocuments } from "@/lib/policies/registry";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listPublicPolicyDocuments().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const doc = getPolicyBySlug(slug);
  if (!doc || doc.publicVisible === false) return { title: "Not found" };
  return {
    title: `${doc.title} | StarLiz Academy`,
    description: doc.summary,
  };
}

export default async function PolicySlugPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = getPolicyBySlug(slug);
  if (!doc || doc.publicVisible === false) notFound();

  return (
    <PolicyDocShell>
      <PolicyDocumentView doc={doc} />
    </PolicyDocShell>
  );
}
