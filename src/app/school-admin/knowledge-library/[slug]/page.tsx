import { notFound } from "next/navigation";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { getPolicyBySlug, listDocumentsForAudience } from "@/lib/policies/registry";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  const docs = [
    ...listDocumentsForAudience("School Admin"),
    ...listDocumentsForAudience("Tutor"),
  ].filter((doc, index, all) => all.findIndex((item) => item.id === doc.id) === index);
  return docs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const doc = getPolicyBySlug(slug);
  if (!doc) return { title: "Policy" };
  return {
    title: `${doc.title} | School Admin knowledge library`,
    description: doc.summary,
  };
}

/** Authenticated School Admin / teacher viewer for audience-relevant drafts, including staff-only docs. */
export default async function SchoolAdminKnowledgeLibraryDocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = getPolicyBySlug(slug);
  if (!doc) notFound();

  const allowed =
    doc.audience.includes("School Admin")
    || doc.audience.includes("Tutor")
    || doc.audience.includes("Public")
    || doc.audience.includes("Parent");
  if (!allowed) notFound();

  return (
    <div className="min-h-screen bg-slate-950">
      <PolicyDocumentView doc={doc} libraryContext="school-admin" />
    </div>
  );
}
