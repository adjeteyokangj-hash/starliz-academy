import PolicyDocShell from "@/components/layout/PolicyDocShell";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { getPolicyBySlug } from "@/lib/policies/registry";

export const metadata = {
  title: "Data Retention Policy | StarLiz Academy",
  description: "How long StarLiz Academy keeps learning and account records.",
};

export default function DataRetentionPage() {
  const doc = getPolicyBySlug("data-retention");
  if (!doc) return null;
  return (
    <PolicyDocShell>
      <PolicyDocumentView doc={doc} />
    </PolicyDocShell>
  );
}
