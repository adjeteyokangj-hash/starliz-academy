import AdminResourceManager from "@/components/admin/AdminResourceManager";

export default function RewardsPage() {
  return (
    <AdminResourceManager
      title="Rewards"
      description="Control how children earn stars, coins, streak bonuses, badges and certificates."
      resource="rewards"
      primaryField="name"
      fields={[
        { name: "name", label: "Rule name" },
        { name: "trigger", label: "Trigger" },
        { name: "points", label: "Points", type: "number" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
