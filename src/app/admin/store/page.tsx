import AdminResourceManager from "@/components/admin/AdminResourceManager";

export default function StorePage() {
  return (
    <AdminResourceManager
      title="Store / Shop"
      description="Manage what children can spend points on. Rewards define earning; Store defines spending."
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
        { name: "description", label: "Description. Parsed only as fallback when explicit policy fields are empty.", type: "textarea" },
      ]}
    />
  );
}
