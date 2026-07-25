"use client";

import { useParams } from "next/navigation";
import AdminShortLearningOversightPanel from "@/components/admin/schools/AdminShortLearningOversight";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

export default function SchoolAdminShortLearningPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="short-learning"
      title="Short Learning Operations"
      subtitle="School-scoped oversight of AI-led bookings, published tutor shifts, and coverage gaps. Read-only — school owners operate shifts in school-admin."
    >
      <AdminShortLearningOversightPanel schoolId={schoolId} showSchoolLinks={false} />
    </SchoolDashboardShell>
  );
}
