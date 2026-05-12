import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminResourceManager from "@/components/admin/AdminResourceManager";

export default function StorePage() {
  return (
    <div className="space-y-6">
      <AdminSectionCard title="Store Policy Format" eyebrow="Rewards Engine">
        <p className="text-sm text-slate-300">
          You can encode stock and approval workflow directly in item description using tokens:
          <span className="ml-2 rounded bg-slate-900 px-2 py-1 text-xs text-slate-200">type:digital|physical</span>
          <span className="ml-2 rounded bg-slate-900 px-2 py-1 text-xs text-slate-200">approval:none|parent|admin</span>
          <span className="ml-2 rounded bg-slate-900 px-2 py-1 text-xs text-slate-200">stock:25</span>
        </p>
      </AdminSectionCard>
      <AdminResourceManager
        title="Store / Shop"
        description="Manage what children can spend points on. Rewards define earning; Store defines spending with stock/approval states."
        resource="store"
        primaryField="name"
        fields={[
          { name: "name", label: "Item name" },
          { name: "category", label: "Category", type: "select", options: ["themes", "avatars", "voices", "pet", "boosts"] },
          { name: "price", label: "Coin price", type: "number" },
          { name: "minAge", label: "Minimum age", type: "number" },
          { name: "maxAge", label: "Maximum age", type: "number" },
          { name: "requiredLevel", label: "Required level", type: "number" },
          { name: "isActive", label: "Active", type: "checkbox" },
          { name: "description", label: "Description with policy tokens: type:physical approval:admin stock:10", type: "textarea" },
        ]}
      />
    </div>
  );
}
