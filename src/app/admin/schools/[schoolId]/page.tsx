import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolRootPage({ params }: PageProps) {
  const { schoolId } = await params;
  redirect(`/admin/schools/${schoolId}/dashboard`);
}
