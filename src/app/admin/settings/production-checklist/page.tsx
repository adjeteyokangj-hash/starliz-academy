import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { productionChecklist } from "@/lib/production-checklist";

const migrationCommands = [
  'pg_dump "$PRODUCTION_DATABASE_URL" --format=custom --file ./tmp/prod-pre-migration.backup',
  'npm run migration:export -- --database-url "$LOCAL_DATABASE_URL" --out ./tmp/migration-local.json --note "pre-prod sync"',
  'npm run migration:import -- --database-url "$PRODUCTION_DATABASE_URL" --in ./tmp/migration-local.json',
  'npm run migration:import -- --database-url "$PRODUCTION_DATABASE_URL" --in ./tmp/migration-local.json --apply',
  'npm run migration:sync:prod -- --dump ./tmp/migration-local.json --apply --confirm-live YES_I_UNDERSTAND',
];

const rollbackCommands = [
  'pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$PRODUCTION_DATABASE_URL" ./tmp/prod-pre-migration.backup',
  'npm run smoke:routes',
];

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

      <AdminSectionCard title="Migration Command Sequence">
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Run this exact order for one-way local to production migration (parents, lessons, content library, assignments).
          </p>
          <ol className="space-y-2 text-sm text-slate-300">
            {migrationCommands.map((command, index) => (
              <li key={command} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs">
                <span className="mr-2 text-slate-500">{index + 1}.</span>
                {command}
              </li>
            ))}
          </ol>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Rollback Steps">
        <div className="space-y-3">
          <p className="text-sm text-rose-300">
            If post-migration verification fails, restore production backup immediately.
          </p>
          <ol className="space-y-2 text-sm text-slate-300">
            {rollbackCommands.map((command, index) => (
              <li key={command} className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-3 font-mono text-xs text-rose-100">
                <span className="mr-2 text-rose-300">{index + 1}.</span>
                {command}
              </li>
            ))}
          </ol>
        </div>
      </AdminSectionCard>
    </div>
  );
}
