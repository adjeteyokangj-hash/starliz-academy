import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolTodayTimetable from "@/components/admin/schools/SchoolTodayTimetable";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolTimetablePage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="timetable"
      title="Today’s Timetable"
      subtitle="Real daytime periods with tutors, rooms, and class lessons."
    >
      <SchoolTodayTimetable schoolId={schoolId} />
    </SchoolDashboardShell>
  );
}
