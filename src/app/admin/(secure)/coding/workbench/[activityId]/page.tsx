import ActivityLoader from "@/components/coding/ActivityLoader";

export default async function AuthorWorkbench({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  return <><p className="mx-auto my-4 max-w-5xl rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">Private author verification. This temporary session does not change learner records, award achievements or publish curriculum content. Learner save/resume uses the persistent, separately authorised workspace.</p><ActivityLoader activityId={activityId} endpoint={`/api/admin/coding/workbench/${encodeURIComponent(activityId)}`} /></>;
}
