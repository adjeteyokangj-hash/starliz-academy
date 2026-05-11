import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { productionChecklist } from "@/lib/production-checklist";

export default function ProductionChecklistPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Production Checklist</h1>
        <p className="mt-1 text-slate-400">Go-live checks for provider credentials, monitoring, backups, security and testing.</p>
      </div>

      <AdminSectionCard title="Final Checks">
        <div className="grid gap-3 md:grid-cols-2">
          {productionChecklist.map((check) => (
            <div key={`${check.area}-${check.item}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-black text-white">{check.area}</p>
              <p className="mt-2 text-sm text-slate-400">{check.item}</p>
            </div>
          ))}
        </div>
      </AdminSectionCard>
    </div>
  );
}
