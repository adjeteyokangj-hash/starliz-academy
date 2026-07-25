import PolicyDocShell from "@/components/layout/PolicyDocShell";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { getPolicyBySlug } from "@/lib/policies/registry";

export const metadata = {
  title: "Privacy Policy | StarLiz Academy",
  description: "How StarLiz Academy processes personal data under UK GDPR.",
};

export default function PrivacyPage() {
  const doc = getPolicyBySlug("privacy");
  if (!doc) return null;
  return (
    <PolicyDocShell>
      <PolicyDocumentView doc={doc} />
    </PolicyDocShell>
  );
}
