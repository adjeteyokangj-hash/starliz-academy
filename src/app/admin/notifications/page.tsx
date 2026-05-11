import AdminResourceManager from "@/components/admin/AdminResourceManager";

export default function NotificationsPage() {
  return (
    <AdminResourceManager
      title="Notifications"
      description="Control parent emails, in-app alerts, learning reminders and subscription reminders."
      resource="notifications"
      primaryField="name"
      fields={[
        { name: "name", label: "Template name" },
        { name: "channel", label: "Channel", type: "select", options: ["email", "in_app", "sms"] },
        { name: "subject", label: "Subject" },
        { name: "isActive", label: "Active", type: "checkbox" },
        { name: "body", label: "Body", type: "textarea" },
      ]}
    />
  );
}
