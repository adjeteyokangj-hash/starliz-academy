import { SchoolDashboardProvider } from "@/components/admin/schools/school-dashboard-data";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ schoolId: string }>;
};

/** Keep school dashboard data mounted across tab navigations to avoid reloading on every tab. */
export default async function SchoolIdLayout({ children, params }: LayoutProps) {
  const { schoolId } = await params;
  return (
    <SchoolDashboardProvider schoolId={schoolId}>
      {children}
    </SchoolDashboardProvider>
  );
}
