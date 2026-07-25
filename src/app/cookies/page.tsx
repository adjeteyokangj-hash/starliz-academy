import PolicyDocShell from "@/components/layout/PolicyDocShell";
import { PolicyDocumentView } from "@/components/policies/PolicyDocumentView";
import { getPolicyBySlug } from "@/lib/policies/registry";

export const metadata = {
  title: "Cookie Policy | StarLiz Academy",
  description: "Cookies and similar technologies used on StarLiz Academy.",
};

export default function CookiesPage() {
  const doc = getPolicyBySlug("cookies");
  if (!doc) return null;
  return (
    <PolicyDocShell>
      <div id="cookie-policy">
        <PolicyDocumentView doc={doc} />
      </div>
    </PolicyDocShell>
  );
}
