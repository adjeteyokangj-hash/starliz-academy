import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type AdminComingSoonProps = {
  title: string;
  eyebrow: string;
  description: string;
  items: string[];
  actionLabel?: string;
  actionHref?: string;
};

export default function AdminComingSoon({ title, eyebrow, description, items, actionLabel, actionHref }: AdminComingSoonProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <AdminSectionCard title={title} eyebrow={eyebrow}>
        <AdminEmptyState title={`${title} workspace`} description={description} actionLabel={actionLabel} href={actionHref} />
      </AdminSectionCard>
      <AdminSectionCard title="Planned Controls">
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-slate-300">
              {item}
            </div>
          ))}
        </div>
      </AdminSectionCard>
    </div>
  );
}

