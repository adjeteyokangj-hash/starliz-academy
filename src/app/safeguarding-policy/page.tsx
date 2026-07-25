import PolicyDocShell from "@/components/layout/PolicyDocShell";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { getPolicyBySlug } from "@/lib/policies/registry";

export const metadata = {
  title: "Safeguarding and Child Protection | StarLiz Academy",
  description: "Public summary of child welfare commitments and reporting routes.",
};

export default function SafeguardingPolicyPage() {
  const doc = getPolicyBySlug("safeguarding");
  if (!doc) return null;
  return (
    <PolicyDocShell>
      <PolicyDocumentView doc={doc} />
    </PolicyDocShell>
  );
}
