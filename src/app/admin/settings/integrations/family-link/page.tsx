import AdminSectionCard from "@/components/admin/AdminSectionCard";

export default function FamilyLinkGuidancePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-violet-300">Integration guidance</p>
        <h1 className="mt-2 text-3xl font-black text-white">Google Family Link</h1>
        <p className="mt-2 max-w-3xl text-slate-400">
          Family Link setup is manual. StarLiz does not connect directly to Family Link APIs; parents use Family Link on the child device while StarLiz manages learning access and progress inside the app.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSectionCard title="Parent Setup">
          <ul className="space-y-3 text-sm text-slate-300">
            <li>Parent installs or approves StarLiz on the child device.</li>
            <li>Parent allows microphone and audio permissions so voice features work.</li>
            <li>Parent manages screen time separately inside Family Link.</li>
            <li>Parent can update device restrictions at any time from their Google Family Link app.</li>
          </ul>
        </AdminSectionCard>

        <AdminSectionCard title="What StarLiz Handles">
          <ul className="space-y-3 text-sm text-slate-300">
            <li>Parent consent and account ownership.</li>
            <li>Child profiles linked to the parent account.</li>
            <li>Subscription-based learning access.</li>
            <li>Spelling, maths and reading progress tracking.</li>
            <li>Rewards, content approvals and admin audit logs.</li>
          </ul>
        </AdminSectionCard>
      </div>
    </div>
  );
}
