import PolicyDocShell from "@/components/layout/PolicyDocShell";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { getPolicyBySlug } from "@/lib/policies/registry";

export const metadata = {
  title: "AI Use and Transparency | StarLiz Academy",
  description: "How AI tutoring works and the Short Learning human-support promise.",
};

export default function AiUsePage() {
  const doc = getPolicyBySlug("ai-use");
  if (!doc) return null;
  return (
    <PolicyDocShell>
      <PolicyDocumentView doc={doc} />
    </PolicyDocShell>
  );
}
