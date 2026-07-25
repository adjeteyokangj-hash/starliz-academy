"use client";

import AdminShortLearningOversightPanel from "@/components/admin/schools/AdminShortLearningOversight";
import { AdminButtonLink, AdminPageHeader } from "@/components/admin/ui";

export default function AdminShortLearningPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operations"
        title="Short Learning oversight"
        subtitle="Cross-school read-only view of AI-led session bookings, published tutor shifts, and coverage gaps. No auto-publishing."
        actions={
          <>
            <AdminButtonLink href="/admin/schools">Schools</AdminButtonLink>
            <AdminButtonLink href="/school-admin/short-learning" variant="secondary">
              School-admin portal
            </AdminButtonLink>
          </>
        }
      />
      <AdminShortLearningOversightPanel showSchoolLinks />
    </div>
  );
}
