import PolicyDocShell from "@/components/layout/PolicyDocShell";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { getPolicyBySlug } from "@/lib/policies/registry";

export const metadata = {
  title: "Terms and Conditions | StarLiz Academy",
  description: "Rules for using StarLiz Academy websites, apps and learning services.",
};

export default function TermsPage() {
  const doc = getPolicyBySlug("terms");
  if (!doc) return null;
  return (
    <PolicyDocShell>
      <PolicyDocumentView doc={doc} />
    </PolicyDocShell>
  );
}
