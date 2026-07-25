import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolDashboardLandingOverview from "@/components/admin/schools/SchoolDashboardLandingOverview";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolDashboardPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="dashboard"
      title="School Dashboard"
      subtitle="Full individual school dashboard for operations, learning delivery, and governance."
    >
      <SchoolDashboardLandingOverview schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
