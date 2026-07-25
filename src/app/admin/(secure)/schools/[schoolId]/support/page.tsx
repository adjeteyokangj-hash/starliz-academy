"use client";

import { useParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import AdminSupportOperations from "@/components/admin/schools/AdminSupportOperations";

export default function SchoolAdminSupportPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="support"
      title="Human Support Operations"
      subtitle="Live tutor oversight, open cases, abandoned-session control, and unresolved follow-up. Admin never teaches."
    >
      <AdminSupportOperations schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
